package app

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Live trip features: ETA, nearby availability, push stream and driver vehicle changes.

type etaEntry struct {
	seconds, meters int64
	expires         time.Time
}

var etaCache sync.Map

// etaBetween prefers real road routing (cached briefly so polling does not flood the router)
// and falls back to a straight-line estimate when routing is unavailable.
func (s *Server) etaBetween(ctx context.Context, key string, a, b Point) (int64, int64) {
	if v, ok := etaCache.Load(key); ok {
		if e := v.(etaEntry); time.Now().Before(e.expires) {
			return e.seconds, e.meters
		}
	}
	var seconds, meters int64
	if s.Config.RoutingURL != "" {
		c, cancel := context.WithTimeout(ctx, 3*time.Second)
		m, sec, _, e := s.routeVia(c, []Point{a, b}, 200000, 86400, true)
		cancel()
		if e == nil {
			seconds, meters = sec, m
		}
	}
	if seconds == 0 {
		meters = int64(distance(a, b) * 1.3)
		seconds = int64(float64(meters) / 6.5)
	}
	etaCache.Store(key, etaEntry{seconds, meters, time.Now().Add(12 * time.Second)})
	return seconds, meters
}

// addETAs annotates the rider's active rides with the driver's live arrival or trip-completion estimate.
func (s *Server) addETAs(ctx context.Context, rides []map[string]any) {
	for _, ride := range rides {
		lat, ok1 := ride["driver_lat"].(float64)
		lng, ok2 := ride["driver_lng"].(float64)
		status, _ := ride["status"].(string)
		if !ok1 || !ok2 || ride["mine"] != true {
			continue
		}
		var target Point
		switch status {
		case "accepted":
			target = Point{Lat: num(ride["pickup_lat"]), Lng: num(ride["pickup_lng"])}
			ride["eta_target"] = "pickup"
		case "in_progress":
			target = Point{Lat: num(ride["dropoff_lat"]), Lng: num(ride["dropoff_lng"])}
			ride["eta_target"] = "destination"
		default:
			continue
		}
		seconds, meters := s.etaBetween(ctx, fmt.Sprintf("%v:%s", ride["id"], status), Point{Lat: lat, Lng: lng}, target)
		ride["eta_seconds"], ride["eta_meters"] = seconds, meters
		ride["eta_at"] = time.Now().Add(time.Duration(seconds) * time.Second).UTC().Format(time.RFC3339)
	}
}

func num(v any) float64 {
	f, _ := v.(float64)
	return f
}

// nearby reports driver availability and the nearest pickup time for each vehicle category around a point.
func (s *Server) nearby(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var lat, lng float64
	if _, e := fmt.Sscanf(q.Get("lat")+" "+q.Get("lng"), "%f %f", &lat, &lng); e != nil || !(Point{Lat: lat, Lng: lng, Label: "pin"}).valid() {
		fail(w, 400, "Invalid coordinates")
		return
	}
	pink := q.Get("pink") == "1"
	if area, ok := s.areaFor(r.Context(), lat, lng); ok && !pink {
		if hits, e := s.searchLive(r.Context(), area, lat, lng, 20000); e == nil && len(hits) > 0 {
			write(w, 200, nearbyFromHits(hits))
			return
		}
	}
	rows, e := jsonRows(r.Context(), s.DB, `SELECT vehicle_category AS category, count(*) AS drivers,
 round(min(6371000*acos(least(1,greatest(-1,sin(radians(d.lat))*sin(radians($1::float8))+cos(radians(d.lat))*cos(radians($1::float8))*cos(radians(d.lng-$2::float8))))))) AS nearest_meters
 FROM drivers d WHERE d.online AND d.status='approved' AND (NOT $3::boolean OR d.pink_certified) AND d.location_at>now()-interval '60 seconds'
 AND d.lat BETWEEN $1::float8-0.19 AND $1::float8+0.19 AND d.lng BETWEEN $2::float8-0.2 AND $2::float8+0.2
 AND NOT EXISTS(SELECT 1 FROM rides b WHERE b.driver_id=d.user_id AND b.status IN ('accepted','arrived','in_progress'))
 AND 6371000*acos(least(1,greatest(-1,sin(radians(d.lat))*sin(radians($1::float8))+cos(radians(d.lat))*cos(radians($1::float8))*cos(radians(d.lng-$2::float8)))))<=d.pickup_radius_meters
 GROUP BY vehicle_category`, lat, lng, pink)
	if e != nil {
		dbError(w, e)
		return
	}
	positions, e := jsonRows(r.Context(), s.DB, `SELECT substr(md5(d.user_id::text),1,8) AS id, vehicle_category AS category, round(d.lat::numeric,4) AS lat, round(d.lng::numeric,4) AS lng
 FROM drivers d WHERE d.online AND d.status='approved' AND (NOT $3::boolean OR d.pink_certified) AND d.location_at>now()-interval '60 seconds'
 AND d.lat BETWEEN $1::float8-0.19 AND $1::float8+0.19 AND d.lng BETWEEN $2::float8-0.2 AND $2::float8+0.2
 AND NOT EXISTS(SELECT 1 FROM rides b WHERE b.driver_id=d.user_id AND b.status IN ('accepted','arrived','in_progress'))
 AND 6371000*acos(least(1,greatest(-1,sin(radians(d.lat))*sin(radians($1::float8))+cos(radians(d.lat))*cos(radians($1::float8))*cos(radians(d.lng-$2::float8)))))<=5000 LIMIT 30`, lat, lng, pink)
	if e != nil {
		dbError(w, e)
		return
	}
	var list []map[string]any
	_ = json.Unmarshal(rows, &list)
	for _, item := range list {
		meters := num(item["nearest_meters"]) * 1.3
		item["eta_minutes"] = int(meters/6.5/60) + 1
	}
	write(w, 200, map[string]any{"nearby": list, "drivers": positions})
}

// stream pushes server-sent events so clients learn about new offers and ride changes immediately.
func (s *Server) stream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		fail(w, 500, "Streaming unsupported")
		return
	}
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})
	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)
	fmt.Fprint(w, "retry: 3000\n\n")
	flusher.Flush()

	uid := user(r).Account.ID
	ctx := r.Context()
	offers, rides, notes := map[string]bool{}, map[string]string{}, map[string]bool{}
	first := true
	wake, unsubscribe := s.Events.subscribe(uid)
	defer unsubscribe()
	// Safety net for time-based changes (offer expiry) and any missed signal; real changes arrive via wake.
	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	keepalive := 0
	for {
		var messages []map[string]string
		ids, e := jsonRows(ctx, s.DB, `SELECT r.id::text AS id, q.pickup_label, q.dropoff_label, COALESCE(r.offered_fare_paise,q.fare_paise) AS fare`+offerFrom+` ORDER BY r.created_at LIMIT 20`, uid)
		if e == nil {
			var raw []map[string]any
			_ = json.Unmarshal(ids, &raw)
			seen := map[string]bool{}
			for _, o := range raw {
				id := fmt.Sprint(o["id"])
				seen[id] = true
				if !offers[id] && !first {
					messages = append(messages, map[string]string{"kind": "offer", "title": "New ride request", "body": fmt.Sprintf("%v → %v · ₹%d", o["pickup_label"], o["dropoff_label"], int64(num(o["fare"]))/100)})
				}
			}
			for id := range offers {
				if seen[id] {
					continue
				}
				var status string
				var other bool
				if s.DB.QueryRow(ctx, "SELECT status, driver_id IS NOT NULL AND driver_id<>$2::uuid FROM rides WHERE id=$1", id, uid).Scan(&status, &other) == nil && other {
					messages = append(messages, map[string]string{"kind": "taken", "title": "Ride taken", "body": "Another driver accepted this request first."})
				}
			}
			offers = seen
		}
		active, e := jsonRows(ctx, s.DB, `SELECT r.id::text AS id, r.status, r.rider_id=$1::uuid AS mine FROM rides r WHERE (r.rider_id=$1 OR r.driver_id=$1) AND r.created_at>now()-interval '2 days'`, uid)
		if e == nil {
			var raw []map[string]any
			_ = json.Unmarshal(active, &raw)
			for _, ride := range raw {
				id, status := fmt.Sprint(ride["id"]), fmt.Sprint(ride["status"])
				if prev, known := rides[id]; (known || !first) && prev != status {
					if title, body := rideMessage(status, ride["mine"] == true); title != "" {
						messages = append(messages, map[string]string{"kind": "ride", "title": title, "body": body})
					}
				}
				rides[id] = status
			}
		}
		unread, e := jsonRows(ctx, s.DB, `SELECT id::text AS id, title, body FROM notifications WHERE account_id=$1 AND read_at IS NULL AND created_at>now()-interval '1 day' ORDER BY created_at LIMIT 20`, uid)
		if e == nil {
			var raw []map[string]any
			_ = json.Unmarshal(unread, &raw)
			for _, n := range raw {
				id := fmt.Sprint(n["id"])
				if !notes[id] {
					notes[id] = true
					if !first {
						messages = append(messages, map[string]string{"kind": "notification", "title": fmt.Sprint(n["title"]), "body": fmt.Sprint(n["body"])})
					}
				}
			}
		}
		first = false
		for _, m := range messages {
			b, _ := json.Marshal(m)
			fmt.Fprintf(w, "event: push\ndata: %s\n\n", b)
		}
		keepalive++
		if len(messages) == 0 && keepalive%2 == 0 {
			fmt.Fprint(w, ": keepalive\n\n")
		}
		flusher.Flush()
		select {
		case <-ctx.Done():
			return
		case <-wake:
			time.Sleep(75 * time.Millisecond) // coalesce bursts of related changes into one pass
		case <-tick.C:
		}
	}
}

func rideMessage(status string, rider bool) (string, string) {
	if rider {
		switch status {
		case "accepted":
			return "Driver is on the way", "Your driver accepted the ride. Track them live in the app."
		case "arrived":
			return "Your driver has arrived", "Share your ride-start code with the driver."
		case "in_progress":
			return "Trip started", "Have a safe journey."
		case "completed":
			return "Trip completed", "Your receipt is ready. Please rate your driver."
		case "cancelled":
			return "Ride cancelled", "This ride was cancelled."
		case "expired":
			return "No driver found", "No nearby driver accepted in time. Try again."
		}
		return "", ""
	}
	switch status {
	case "cancelled":
		return "Ride cancelled", "The rider cancelled this trip."
	case "completed":
		return "Trip completed", "The trip is complete."
	}
	return "", ""
}

var vehiclePlate = regexp.MustCompile(`^[A-Za-z0-9 -]{6,20}$`)

// requestVehicleChange lets an approved driver ask to switch vehicle; an operator must approve it.
func (s *Server) requestVehicleChange(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Category string `json:"vehicle_category"`
		Number   string `json:"vehicle_number"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Number = strings.ToUpper(strings.TrimSpace(in.Number))
	if !validVehicleCategory(in.Category) || !vehiclePlate.MatchString(in.Number) {
		fail(w, 400, "Choose a vehicle type and enter a valid registration number")
		return
	}
	ctx := r.Context()
	uid := user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var busy bool
	var status, category, number string
	if e = tx.QueryRow(ctx, `SELECT status,vehicle_category,vehicle_number,EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress')) FROM drivers WHERE user_id=$1 FOR UPDATE`, uid).Scan(&status, &category, &number, &busy); e != nil {
		fail(w, 404, "Driver profile not found")
		return
	}
	switch {
	case status != "approved":
		fail(w, 403, "Only approved drivers can change vehicle")
	case busy:
		fail(w, 409, "Finish your current trip before changing vehicle")
	case category == in.Category && number == in.Number:
		fail(w, 400, "That is already your vehicle")
	default:
		if _, e = tx.Exec(ctx, "UPDATE vehicle_change_requests SET status='cancelled' WHERE driver_id=$1 AND status='pending'", uid); e == nil {
			_, e = tx.Exec(ctx, "INSERT INTO vehicle_change_requests(driver_id,vehicle_category,vehicle_number) VALUES($1,$2,$3)", uid, in.Category, in.Number)
		}
		if e == nil {
			e = audit(ctx, tx, uid, "", "vehicle_change_requested", map[string]string{"category": in.Category, "number": in.Number})
		}
		if e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
	}
}

func (s *Server) reviewVehicleChange(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if (in.Status != "approved" && in.Status != "rejected") || len(strings.TrimSpace(in.Note)) < 5 || len(in.Note) > 1000 {
		fail(w, 400, "Provide a decision and a review note")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var driver, category, number string
	e = tx.QueryRow(ctx, `UPDATE vehicle_change_requests SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING driver_id,vehicle_category,vehicle_number`,
		r.PathValue("id"), in.Status, in.Note, user(r).Account.ID).Scan(&driver, &category, &number)
	if e != nil {
		fail(w, 404, "No pending vehicle request found")
		return
	}
	if in.Status == "approved" {
		// Going offline forces the driver to re-register their location under the new vehicle category.
		if _, e = tx.Exec(ctx, "UPDATE drivers SET vehicle_category=$2,vehicle_number=$3,online=false,updated_at=now() WHERE user_id=$1", driver, category, number); e != nil {
			dbError(w, e)
			return
		}
		s.dropLive(ctx, driver)
	}
	if e = notify(ctx, tx, driver, "vehicle", "Vehicle request "+in.Status, in.Note); e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "vehicle_change_reviewed", map[string]string{"driver_id": driver, "status": in.Status})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

type navStep struct {
	Instruction string  `json:"instruction"`
	Maneuver    string  `json:"maneuver"`
	Meters      int64   `json:"meters"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
}

func stepText(kind, modifier, road string) (string, string) {
	dir := strings.TrimSpace(modifier)
	arrow := "straight"
	switch dir {
	case "left", "sharp left", "slight left":
		arrow = "left"
	case "right", "sharp right", "slight right":
		arrow = "right"
	case "uturn":
		arrow = "uturn"
	}
	onto := ""
	if road != "" {
		onto = " onto " + road
	}
	switch kind {
	case "depart":
		return "Head out" + onto, "straight"
	case "arrive":
		return "You have arrived", "arrive"
	case "roundabout", "rotary":
		return "Take the roundabout" + onto, "straight"
	case "continue", "new name":
		return "Continue" + onto, arrow
	}
	if dir == "" || dir == "straight" {
		return "Continue straight" + onto, "straight"
	}
	return "Turn " + dir + onto, arrow
}

// navigate returns the live road route and turn-by-turn steps from the driver's position to the next stop of the trip.
func (s *Server) navigate(w http.ResponseWriter, r *http.Request) {
	uid, id := user(r).Account.ID, r.PathValue("id")
	var status string
	var rider, driver *string
	var pLat, pLng, dLat, dLng float64
	var lat, lng *float64
	var at *time.Time
	e := s.DB.QueryRow(r.Context(), `SELECT r.status,r.rider_id::text,r.driver_id::text,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng,d.lat,d.lng,d.location_at
 FROM rides r JOIN quotes q ON q.id=r.quote_id LEFT JOIN drivers d ON d.user_id=r.driver_id WHERE r.id=$1`, id).Scan(&status, &rider, &driver, &pLat, &pLng, &dLat, &dLng, &lat, &lng, &at)
	if e != nil || !((rider != nil && *rider == uid) || (driver != nil && *driver == uid)) {
		fail(w, 404, "Ride not found")
		return
	}
	if driver != nil {
		if la, ln, t, ok := s.liveDriverPos(r.Context(), *driver); ok {
			lat, lng, at = &la, &ln, &t
		}
	}
	if status != "accepted" && status != "arrived" && status != "in_progress" {
		fail(w, 409, "Navigation is only available during an active trip")
		return
	}
	if lat == nil || lng == nil || at == nil || time.Since(*at) > 2*time.Minute {
		fail(w, 409, "Waiting for the driver's location")
		return
	}
	target, phase := Point{Lat: pLat, Lng: pLng}, "pickup"
	if status == "in_progress" {
		target, phase = Point{Lat: dLat, Lng: dLng}, "destination"
	}
	from := Point{Lat: *lat, Lng: *lng}
	out := map[string]any{"phase": phase, "driver": map[string]float64{"lat": *lat, "lng": *lng}, "target": target}
	meters, seconds := int64(distance(from, target)*1.3), int64(distance(from, target)*1.3/6.5)
	route, steps := []RoutePoint{{Lat: from.Lat, Lng: from.Lng}, {Lat: target.Lat, Lng: target.Lng}}, []navStep{}
	if s.Config.RoutingURL != "" {
		c, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		endpoint := fmt.Sprintf("%s/route/v1/driving/%.6f,%.6f;%.6f,%.6f?overview=full&geometries=geojson&steps=true", strings.TrimRight(s.Config.RoutingURL, "/"), from.Lng, from.Lat, target.Lng, target.Lat)
		req, _ := http.NewRequestWithContext(c, "GET", endpoint, nil)
		if res, err := s.HTTP.Do(req); err == nil {
			var body struct {
				Code   string `json:"code"`
				Routes []struct {
					Distance, Duration float64
					Geometry           struct {
						Coordinates [][]float64 `json:"coordinates"`
					} `json:"geometry"`
					Legs []struct {
						Steps []struct {
							Distance float64 `json:"distance"`
							Name     string  `json:"name"`
							Maneuver struct {
								Type     string    `json:"type"`
								Modifier string    `json:"modifier"`
								Location []float64 `json:"location"`
							} `json:"maneuver"`
						} `json:"steps"`
					} `json:"legs"`
				} `json:"routes"`
			}
			if json.NewDecoder(http.MaxBytesReader(nil, res.Body, 2*1024*1024)).Decode(&body) == nil && body.Code == "Ok" && len(body.Routes) > 0 && len(body.Routes[0].Geometry.Coordinates) > 1 {
				rt := body.Routes[0]
				meters, seconds = int64(rt.Distance), int64(rt.Duration)
				route = route[:0]
				for _, p := range rt.Geometry.Coordinates {
					if len(p) >= 2 {
						route = append(route, RoutePoint{Lat: p[1], Lng: p[0]})
					}
				}
				for _, leg := range rt.Legs {
					for _, st := range leg.Steps {
						if len(st.Maneuver.Location) < 2 {
							continue
						}
						text, arrow := stepText(st.Maneuver.Type, st.Maneuver.Modifier, st.Name)
						steps = append(steps, navStep{text, arrow, int64(st.Distance), st.Maneuver.Location[1], st.Maneuver.Location[0]})
					}
				}
			}
			res.Body.Close()
		}
		cancel()
	}
	out["route"], out["steps"], out["meters"], out["seconds"] = route, steps, meters, seconds
	out["eta_at"] = time.Now().Add(time.Duration(seconds) * time.Second).UTC().Format(time.RFC3339)
	write(w, 200, out)
}

// devDriverNearRequest (development only) moves the calling driver about 500 m from the newest open request in their area,
// so a locally simulated driver can be tested against any pickup the rider chose.
func (s *Server) devDriverNearRequest(w http.ResponseWriter, r *http.Request) {
	if !s.Config.Development {
		fail(w, 404, "Not found")
		return
	}
	var lat, lng float64
	e := s.DB.QueryRow(r.Context(), `SELECT q.pickup_lat,q.pickup_lng FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN drivers d ON d.user_id=$1
 WHERE r.status='requested' AND r.expires_at>now() AND q.area_id=d.area_id AND q.vehicle_category=d.vehicle_category ORDER BY r.created_at DESC LIMIT 1`, user(r).Account.ID).Scan(&lat, &lng)
	if e != nil {
		fail(w, 404, "No open request for your vehicle type right now")
		return
	}
	lat, lng = lat+0.004, lng+0.003
	tag, e := s.DB.Exec(r.Context(), "UPDATE drivers SET lat=$2,lng=$3,accuracy=10,location_at=now() WHERE user_id=$1 AND online AND status='approved'", user(r).Account.ID, lat, lng)
	if e != nil || tag.RowsAffected() == 0 {
		fail(w, 400, "Driver is not approved")
		return
	}
	var area, category string
	var radius int
	if s.DB.QueryRow(r.Context(), "SELECT area_id::text,vehicle_category,pickup_radius_meters FROM drivers WHERE user_id=$1", user(r).Account.ID).Scan(&area, &category, &radius) == nil {
		_ = s.putLive(r.Context(), user(r).Account.ID, liveMeta{Area: area, Category: category, Radius: radius}, lat, lng, 10)
	}
	write(w, 200, map[string]float64{"lat": lat, "lng": lng})
}

// ridePosition is a cheap poll (no routing) returning the driver's latest location for an active trip.
func (s *Server) ridePosition(w http.ResponseWriter, r *http.Request) {
	uid, id := user(r).Account.ID, r.PathValue("id")
	var status string
	var lat, lng *float64
	var at *time.Time
	var driverID *string
	e := s.DB.QueryRow(r.Context(), `SELECT r.status,r.driver_id::text,d.lat,d.lng,d.location_at FROM rides r LEFT JOIN drivers d ON d.user_id=r.driver_id
 WHERE r.id=$1 AND (r.rider_id=$2::uuid OR r.driver_id=$2::uuid)`, id, uid).Scan(&status, &driverID, &lat, &lng, &at)
	if e != nil {
		fail(w, 404, "Ride not found")
		return
	}
	if driverID != nil {
		if la, ln, t, ok := s.liveDriverPos(r.Context(), *driverID); ok {
			lat, lng, at = &la, &ln, &t
		}
	}
	if lat == nil || lng == nil || at == nil {
		fail(w, 409, "Waiting for the driver's location")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	write(w, 200, map[string]any{"status": status, "lat": *lat, "lng": *lng, "at": at.UTC().Format(time.RFC3339Nano)})
}

// nearbyFromHits builds the /api/nearby payload from Redis GEO results (sorted by distance).
func nearbyFromHits(hits []liveHit) map[string]any {
	type agg struct {
		count   int
		nearest float64
	}
	by := map[string]*agg{}
	var positions []map[string]any
	for _, h := range hits {
		a := by[h.Cat]
		if a == nil {
			a = &agg{nearest: h.Meters}
			by[h.Cat] = a
		}
		a.count++
		if len(positions) < 30 && h.Meters <= 5000 {
			sum := md5.Sum([]byte(h.ID))
			positions = append(positions, map[string]any{"id": hex.EncodeToString(sum[:])[:8], "category": h.Cat, "lat": math.Round(h.Lat*1e4) / 1e4, "lng": math.Round(h.Lng*1e4) / 1e4})
		}
	}
	list := []map[string]any{}
	for _, c := range liveCategories {
		if a := by[c]; a != nil {
			list = append(list, map[string]any{"category": c, "drivers": a.count, "nearest_meters": math.Round(a.nearest), "eta_minutes": int(a.nearest*1.3/6.5/60) + 1})
		}
	}
	return map[string]any{"nearby": list, "drivers": positions}
}
