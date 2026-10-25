package app

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var upiPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{2,128}@[A-Za-z0-9.-]{2,64}$`)

var (
	vehiclePattern = regexp.MustCompile(`^[A-Z0-9]{6,12}$`)
	refPattern     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 /._-]{3,38}[A-Za-z0-9]$`)
	uuidPattern    = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

// validateDriverApplication trims and normalises the inputs in place and returns the first problem found, or "".
func validateDriverApplication(area, vehicle, license, insurance, upi *string, licenseExpires, insuranceExpires string) string {
	*area, *license, *insurance, *upi = strings.TrimSpace(*area), strings.TrimSpace(*license), strings.TrimSpace(*insurance), strings.TrimSpace(*upi)
	*vehicle = strings.ToUpper(strings.NewReplacer(" ", "", "-", "").Replace(*vehicle))
	if !uuidPattern.MatchString(*area) {
		return "Choose your service area"
	}
	hasLetter, hasDigit := strings.IndexFunc(*vehicle, func(r rune) bool { return r >= 'A' && r <= 'Z' }) >= 0, strings.IndexFunc(*vehicle, func(r rune) bool { return r >= '0' && r <= '9' }) >= 0
	if !vehiclePattern.MatchString(*vehicle) || !hasLetter || !hasDigit {
		return "Enter the vehicle registration number, for example KA01AB1234"
	}
	if !refPattern.MatchString(*license) {
		return "Enter your driving licence number (5-40 letters, digits, spaces, / . _ -)"
	}
	if !refPattern.MatchString(*insurance) {
		return "Enter your insurance policy number (5-40 letters, digits, spaces, / . _ -)"
	}
	if *upi != "" && !upiPattern.MatchString(*upi) {
		return "Enter a valid UPI ID such as name@bank"
	}
	today := time.Now().UTC().Add(5*time.Hour + 30*time.Minute).Truncate(24 * time.Hour)
	for label, value := range map[string]string{"Driving licence": licenseExpires, "Insurance": insuranceExpires} {
		date, e := time.Parse("2006-01-02", value)
		if e != nil {
			return label + " expiry date is required (YYYY-MM-DD)"
		}
		if date.Before(today) {
			return label + " has expired; renew it before applying"
		}
		if date.After(today.AddDate(25, 0, 0)) {
			return label + " expiry date is not realistic"
		}
	}
	return ""
}

func (s *Server) applyDriver(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Area             string `json:"area_id"`
		Category         string `json:"vehicle_category"`
		Vehicle          string `json:"vehicle_number"`
		UPI              string `json:"upi_id"`
		License          string `json:"license_reference"`
		Insurance        string `json:"insurance_reference"`
		LicenseExpires   string `json:"license_expires"`
		InsuranceExpires string `json:"insurance_expires"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !hasMobile(r.Context(), s.DB, user(r).Account.ID) {
		fail(w, 403, mobileRequired)
		return
	}
	if in.Category == "" {
		in.Category = "bike"
	}
	if !validVehicleCategory(in.Category) {
		fail(w, 400, "Choose a supported vehicle category")
		return
	}
	if msg := validateDriverApplication(&in.Area, &in.Vehicle, &in.License, &in.Insurance, &in.UPI, in.LicenseExpires, in.InsuranceExpires); msg != "" {
		fail(w, 400, msg)
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var active, categoryEnabled bool
	if e = tx.QueryRow(ctx, `SELECT active,
 EXISTS(SELECT 1 FROM area_vehicle_pricing WHERE area_id=areas.id AND category=$2 AND enabled)
 FROM areas WHERE id=$1`, in.Area, in.Category).Scan(&active, &categoryEnabled); e != nil {
		dbError(w, e)
		return
	}
	if !active {
		fail(w, 400, "This service area is not accepting applications")
		return
	}
	if !categoryEnabled {
		fail(w, 409, "This vehicle category is not enabled in the selected service area")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO drivers(user_id,area_id,vehicle_category,vehicle_number,upi_id,license_reference,insurance_reference,license_expires,insurance_expires) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, user(r).Account.ID, in.Area, in.Category, in.Vehicle, in.UPI, in.License, in.Insurance, in.LicenseExpires, in.InsuranceExpires)
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "driver_application", map[string]string{"area": in.Area})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"status": "pending"})
}
func (s *Server) location(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Lat      float64 `json:"lat"`
		Lng      float64 `json:"lng"`
		Accuracy float64 `json:"accuracy"`
	}
	if !decode(w, r, &in) {
		return
	}
	if math.IsNaN(in.Lat) || math.IsNaN(in.Lng) || in.Accuracy < 1 || in.Accuracy > 100 {
		fail(w, 400, "Location accuracy must be within 100 metres")
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if e = lockJourney(ctx, tx, uid); e != nil {
		dbError(w, e)
		return
	}
	var online bool
	if e = tx.QueryRow(ctx, "SELECT COALESCE((SELECT online FROM drivers WHERE user_id=$1),false)", uid).Scan(&online); e != nil {
		dbError(w, e)
		return
	}
	riding, e := ridingNow(ctx, tx, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	if !online || riding {
		s.dropLive(ctx, uid)
		fail(w, 403, "You are offline. Finish your rider trip, then go online in Captain to share location")
		return
	}
	// Fast path: a recently validated driver only updates Redis; the database is checkpointed every few seconds.
	if meta, ok := s.liveMetaFor(ctx, uid); ok && !s.shouldFlush(ctx, uid) {
		if s.putLive(ctx, uid, meta, in.Lat, in.Lng, in.Accuracy) == nil {
			if e = tx.Commit(ctx); e != nil {
				dbError(w, e)
				return
			}
			write(w, 200, map[string]any{"online": true, "fresh_for_seconds": 60})
			return
		}
	}
	var area, category string
	var radius int
	e = tx.QueryRow(ctx, `UPDATE drivers d SET lat=$2,lng=$3,accuracy=$4,location_at=now(),updated_at=now() FROM areas a WHERE d.user_id=$1 AND d.online AND d.area_id=a.id AND d.status='approved' AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND a.active AND $2 BETWEEN a.min_lat AND a.max_lat AND $3 BETWEEN a.min_lng AND a.max_lng RETURNING d.area_id::text, d.vehicle_category, d.pickup_radius_meters`, uid, in.Lat, in.Lng, in.Accuracy).Scan(&area, &category, &radius)
	if errors.Is(e, pgx.ErrNoRows) {
		s.dropLive(ctx, uid)
		fail(w, 403, "Approval, valid documents and a location inside your active area are required")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	_ = s.putLive(ctx, uid, liveMeta{Area: area, Category: category, Radius: radius}, in.Lat, in.Lng, in.Accuracy)
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"online": true, "fresh_for_seconds": 60})
}

func (s *Server) driverAvailability(w http.ResponseWriter, r *http.Request) {
	var online bool
	err := s.DB.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM drivers WHERE user_id=$1 AND online AND status='approved')", user(r).Account.ID).Scan(&online)
	if err != nil {
		dbError(w, err)
		return
	}
	write(w, 200, map[string]bool{"online": online})
}

// Going online is an explicit user action; background pings never restore availability.
func (s *Server) online(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(ctx)
	if err = lockJourney(ctx, tx, uid); err != nil {
		dbError(w, err)
		return
	}
	if riding, e := ridingNow(ctx, tx, uid); e != nil {
		dbError(w, e)
		return
	} else if riding {
		fail(w, 409, "Finish or cancel your rider trip before going online in Captain")
		return
	}
	tag, err := tx.Exec(ctx, `UPDATE drivers d SET online=true,location_at=NULL,updated_at=now() FROM areas a
 WHERE d.user_id=$1 AND d.area_id=a.id AND d.status='approved' AND a.active
 AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date
 AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date`, uid)
	if err != nil {
		dbError(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 403, "Approval, valid documents and an active area are required")
		return
	}
	s.dropLive(ctx, uid)
	if err = tx.Commit(ctx); err != nil {
		dbError(w, err)
		return
	}
	write(w, 200, map[string]bool{"online": true})
}

func (s *Server) offline(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(ctx)
	if err = lockJourney(ctx, tx, uid); err != nil {
		dbError(w, err)
		return
	}
	_, err = tx.Exec(ctx, "UPDATE drivers SET online=false WHERE user_id=$1", uid)
	if err != nil {
		dbError(w, err)
		return
	}
	s.dropLive(ctx, uid)
	if err = tx.Commit(ctx); err != nil {
		dbError(w, err)
		return
	}
	write(w, 200, map[string]bool{"online": false})
}

func (s *Server) saveDriverPreferences(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PickupRadiusMeters int   `json:"pickup_radius_meters"`
		MinimumFarePaise   int64 `json:"minimum_fare_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.PickupRadiusMeters < 500 || in.PickupRadiusMeters > 20000 || in.MinimumFarePaise < 0 || in.MinimumFarePaise > 1000000 {
		fail(w, 400, "Pickup distance must be 500–20000 metres and minimum fare 0–1000000 paise")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	tag, e := tx.Exec(ctx, `UPDATE drivers SET pickup_radius_meters=$2,minimum_fare_paise=$3,updated_at=now()
 WHERE user_id=$1`, user(r).Account.ID, in.PickupRadiusMeters, in.MinimumFarePaise)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Submit a driver application before setting preferences")
		return
	}
	if e = audit(ctx, tx, user(r).Account.ID, "", "driver_preferences_updated", in); e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{
		"pickup_radius_meters": in.PickupRadiusMeters,
		"minimum_fare_paise":   in.MinimumFarePaise,
	})
}

func (s *Server) driverEarnings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := user(r).Account.ID
	var driverExists bool
	if e := s.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM drivers WHERE user_id=$1)", uid).Scan(&driverExists); e != nil {
		dbError(w, e)
		return
	}
	if !driverExists {
		fail(w, 403, "Driver earnings are available to driver accounts")
		return
	}

	var summary struct {
		TodayTrips      int   `json:"today_completed_trips"`
		TodayFare       int64 `json:"today_fare_paise"`
		TodayReported   int64 `json:"today_reported_paid_paise"`
		WeekTrips       int   `json:"week_completed_trips"`
		WeekFare        int64 `json:"week_fare_paise"`
		WeekReported    int64 `json:"week_reported_paid_paise"`
		MonthTrips      int   `json:"month_completed_trips"`
		MonthFare       int64 `json:"month_fare_paise"`
		MonthReported   int64 `json:"month_reported_paid_paise"`
		AllTimeTrips    int   `json:"all_time_completed_trips"`
		AllTimeFare     int64 `json:"all_time_fare_paise"`
		AllTimeReported int64 `json:"all_time_reported_paid_paise"`
	}
	e := s.DB.QueryRow(ctx, `SELECT
 COUNT(*) FILTER (WHERE (r.completed_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date),
 COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)) FILTER (WHERE (r.completed_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date),0),
 COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)) FILTER (WHERE r.payment_status IN ('driver_reported_received','paid_online') AND (r.completed_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date),0),
 COUNT(*) FILTER (WHERE date_trunc('week',r.completed_at AT TIME ZONE 'Asia/Kolkata')=date_trunc('week',now() AT TIME ZONE 'Asia/Kolkata')),
 COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)) FILTER (WHERE date_trunc('week',r.completed_at AT TIME ZONE 'Asia/Kolkata')=date_trunc('week',now() AT TIME ZONE 'Asia/Kolkata')),0),
 COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)) FILTER (WHERE r.payment_status IN ('driver_reported_received','paid_online') AND date_trunc('week',r.completed_at AT TIME ZONE 'Asia/Kolkata')=date_trunc('week',now() AT TIME ZONE 'Asia/Kolkata')),0),
 COUNT(*) FILTER (WHERE date_trunc('month',r.completed_at AT TIME ZONE 'Asia/Kolkata')=date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')),
 COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)) FILTER (WHERE date_trunc('month',r.completed_at AT TIME ZONE 'Asia/Kolkata')=date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')),0),
 COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)) FILTER (WHERE r.payment_status IN ('driver_reported_received','paid_online') AND date_trunc('month',r.completed_at AT TIME ZONE 'Asia/Kolkata')=date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')),0),
 COUNT(*),COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)),0),
 COALESCE(SUM(COALESCE(r.offered_fare_paise,q.fare_paise)) FILTER (WHERE r.payment_status IN ('driver_reported_received','paid_online')),0)
 FROM rides r JOIN quotes q ON q.id=r.quote_id
 WHERE r.driver_id=$1 AND r.status='completed'`, uid).Scan(
		&summary.TodayTrips, &summary.TodayFare, &summary.TodayReported,
		&summary.WeekTrips, &summary.WeekFare, &summary.WeekReported,
		&summary.MonthTrips, &summary.MonthFare, &summary.MonthReported,
		&summary.AllTimeTrips, &summary.AllTimeFare, &summary.AllTimeReported,
	)
	if e != nil {
		dbError(w, e)
		return
	}
	rides, e := jsonRows(ctx, s.DB, `SELECT r.id,r.completed_at,q.pickup_label,q.dropoff_label,
 q.vehicle_category,q.meters,q.seconds,COALESCE(r.offered_fare_paise,q.fare_paise) AS fare_paise,r.payment_method,r.payment_status,a.name AS rider_name
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts a ON a.id=r.rider_id
 WHERE r.driver_id=$1 AND r.status='completed'
 ORDER BY r.completed_at DESC LIMIT 50`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"summary": summary, "rides": rides})
}

func (s *Server) incident(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Ride    string `json:"ride_id"`
		Message string `json:"message"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(strings.TrimSpace(in.Message)) < 5 || len(in.Message) > 2000 {
		fail(w, 400, "Describe the issue in 5–2000 characters")
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
	var allowed bool
	e = tx.QueryRow(ctx, "SELECT rider_id=$2 OR COALESCE(driver_id=$2,false) FROM rides WHERE id=$1", in.Ride, uid).Scan(&allowed)
	if e != nil {
		dbError(w, e)
		return
	}
	if !allowed {
		fail(w, 403, "You may only report your own ride")
		return
	}
	var id string
	e = tx.QueryRow(ctx, "INSERT INTO incidents(ride_id,reporter_id,message) VALUES($1,$2,$3) RETURNING id", in.Ride, uid, in.Message).Scan(&id)
	if e == nil {
		e = audit(ctx, tx, uid, in.Ride, "incident_reported", map[string]string{"incident_id": id})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"id": id})
}

// driverInsights adds trip timing, distance, areas and rider feedback on top of the fare summary.
func (s *Server) driverInsights(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	var ok bool
	if e := s.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM drivers WHERE user_id=$1)", uid).Scan(&ok); e != nil || !ok {
		fail(w, 403, "Driver insights are available to driver accounts")
		return
	}
	const base = `WITH t AS (
 SELECT r.id,r.completed_at,r.payment_method,r.payment_status,q.pickup_label,q.dropoff_label,q.trip_type,q.vehicle_category,q.meters,q.seconds,
  COALESCE(r.offered_fare_paise,q.fare_paise) AS fare_paise,COALESCE(q.pink,false) AS pink,
  (SELECT min(created_at) FROM audit_events e WHERE e.ride_id=r.id AND e.action='accepted') AS accepted_at,
  (SELECT min(created_at) FROM audit_events e WHERE e.ride_id=r.id AND e.action='arrived') AS arrived_at,
  (SELECT min(created_at) FROM audit_events e WHERE e.ride_id=r.id AND e.action='in_progress') AS started_at,
  (SELECT score FROM ride_ratings g WHERE g.ride_id=r.id AND g.rated_id=r.driver_id LIMIT 1) AS rating
 FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.driver_id=$1 AND r.status='completed')`
	totals, e := jsonRows(ctx, s.DB, base+` SELECT count(*) AS trips,COALESCE(sum(meters),0) AS meters,
 COALESCE(sum(extract(epoch FROM completed_at-started_at)) FILTER (WHERE started_at IS NOT NULL),0)::bigint AS trip_seconds,
 COALESCE(round(avg(fare_paise)),0)::bigint AS avg_fare_paise,
 COALESCE(round(sum(fare_paise)::numeric/NULLIF(sum(meters)/1000.0,0)),0)::bigint AS fare_per_km_paise,
 COALESCE(round(avg(extract(epoch FROM arrived_at-accepted_at)) FILTER (WHERE arrived_at IS NOT NULL AND accepted_at IS NOT NULL))::bigint,0) AS avg_pickup_seconds,
 round(avg(rating)::numeric,1)::float8 AS avg_rating,count(rating) AS rated,
 COALESCE(max(fare_paise),0) AS best_fare_paise,count(*) FILTER (WHERE pink) AS pink_trips FROM t`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	days, e := jsonRows(ctx, s.DB, base+` SELECT to_char((completed_at AT TIME ZONE 'Asia/Kolkata')::date,'YYYY-MM-DD') AS day,count(*) AS trips,sum(fare_paise) AS fare_paise,sum(meters) AS meters
 FROM t WHERE completed_at>now()-interval '7 days' GROUP BY 1 ORDER BY 1`, uid)
	if e == nil {
		var areas, methods, types, hours json.RawMessage
		areas, e = jsonRows(ctx, s.DB, base+` SELECT trim(split_part(dropoff_label,',',greatest(1,array_length(string_to_array(dropoff_label,','),1)))) AS area,count(*) AS trips,sum(fare_paise) AS fare_paise
 FROM t GROUP BY 1 ORDER BY 2 DESC,3 DESC LIMIT 6`, uid)
		if e == nil {
			methods, e = jsonRows(ctx, s.DB, base+` SELECT payment_method AS method,count(*) AS trips,sum(fare_paise) AS fare_paise FROM t GROUP BY 1 ORDER BY 3 DESC`, uid)
		}
		if e == nil {
			types, e = jsonRows(ctx, s.DB, base+` SELECT trip_type,count(*) AS trips,sum(fare_paise) AS fare_paise,sum(meters) AS meters FROM t GROUP BY 1 ORDER BY 2 DESC`, uid)
		}
		if e == nil {
			hours, e = jsonRows(ctx, s.DB, base+` SELECT extract(hour FROM completed_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,count(*) AS trips FROM t GROUP BY 1 ORDER BY 2 DESC LIMIT 3`, uid)
		}
		if e == nil {
			var trips json.RawMessage
			trips, e = jsonRows(ctx, s.DB, base+` SELECT id,completed_at,pickup_label,dropoff_label,trip_type,vehicle_category,pink,meters,seconds AS est_seconds,fare_paise,payment_method,payment_status,rating,
 round(extract(epoch FROM arrived_at-accepted_at))::bigint AS pickup_seconds,
 round(extract(epoch FROM completed_at-started_at))::bigint AS trip_seconds,started_at FROM t ORDER BY completed_at DESC LIMIT 50`, uid)
			if e == nil {
				write(w, 200, map[string]any{"totals": totals, "days": days, "areas": areas, "methods": methods, "types": types, "peak_hours": hours, "trips": trips})
				return
			}
		}
	}
	dbError(w, e)
}
