package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Point struct {
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Label string  `json:"label"`
}

type RoutePoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

func (p Point) valid() bool {
	return !math.IsNaN(p.Lat) && !math.IsNaN(p.Lng) && p.Lat >= 6 && p.Lat <= 38 && p.Lng >= 68 && p.Lng <= 98 && len(strings.TrimSpace(p.Label)) >= 2 && len(p.Label) <= 160
}

type Area struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	State    string  `json:"state"`
	MinLat   float64 `json:"min_lat"`
	MaxLat   float64 `json:"max_lat"`
	MinLng   float64 `json:"min_lng"`
	MaxLng   float64 `json:"max_lng"`
	Base     int64   `json:"base_paise"`
	PerKM    int64   `json:"per_km_paise"`
	Minimum  int64   `json:"minimum_paise"`
	Version  int     `json:"pricing_version"`
	Active   bool    `json:"active"`
	Approval string  `json:"approval_reference"`
}

type VehiclePricing struct {
	AreaID   string `json:"area_id"`
	Category string `json:"category"`
	Name     string `json:"name"`
	Base     int64  `json:"base_paise"`
	PerKM    int64  `json:"per_km_paise"`
	Minimum  int64  `json:"minimum_paise"`
	Version  int    `json:"pricing_version"`
	// Optional products; nil/zero means the product is not offered.
	StopFee           int64  `json:"stop_fee_paise"`
	Hourly            *int64 `json:"hourly_paise"`
	IncludedKMPerHour int    `json:"included_km_per_hour"`
	ExtraKM           int64  `json:"extra_km_paise"`
	OutstationPerKM   *int64 `json:"outstation_per_km_paise"`
	OutstationAllow   int64  `json:"outstation_allowance_paise"`
}

var vehicleNames = map[string]string{
	"bike":  "Bike",
	"auto":  "Auto-rickshaw",
	"mini":  "Mini cab",
	"sedan": "Sedan",
	"suv":   "SUV",
}

func validVehicleCategory(category string) bool {
	_, ok := vehicleNames[category]
	return ok
}

func (a Area) contains(p Point) bool {
	return p.Lat >= a.MinLat && p.Lat <= a.MaxLat && p.Lng >= a.MinLng && p.Lng <= a.MaxLng
}
func (s *Server) publicConfig(w http.ResponseWriter, r *http.Request) {
	areas, e := jsonRows(r.Context(), s.DB, "SELECT id,name,state,min_lat,max_lat,min_lng,max_lng FROM areas WHERE active ORDER BY state,name")
	if e != nil {
		dbError(w, e)
		return
	}
	vehicles, e := jsonRows(r.Context(), s.DB, `SELECT p.area_id,p.category,p.base_paise,p.per_km_paise,p.minimum_paise,p.pricing_version,p.stop_fee_paise,p.hourly_paise,p.included_km_per_hour,p.extra_km_paise,p.outstation_per_km_paise,p.outstation_allowance_paise
 FROM area_vehicle_pricing p JOIN areas a ON a.id=p.area_id
 WHERE a.active AND p.enabled ORDER BY p.area_id, p.category`)
	if e != nil {
		dbError(w, e)
		return
	}
	var products []VehiclePricing
	if e = json.Unmarshal(vehicles, &products); e != nil {
		fail(w, 500, "Invalid vehicle pricing")
		return
	}
	for i := range products {
		products[i].Name = vehicleNames[products[i].Category]
	}
	write(w, 200, map[string]any{"areas": areas, "vehicles": products, "commission_paise": 0, "development": s.Config.Development, "routing_configured": s.Config.RoutingURL != "",
		"online_payments": s.paymentsConfigured(), "phone_login": s.smsConfigured() || s.Config.Development})
}
func distance(a, b Point) float64 {
	lat1 := a.Lat * math.Pi / 180
	lat2 := b.Lat * math.Pi / 180
	dl := (b.Lat - a.Lat) * math.Pi / 180
	dn := (b.Lng - a.Lng) * math.Pi / 180
	h := math.Pow(math.Sin(dl/2), 2) + math.Cos(lat1)*math.Cos(lat2)*math.Pow(math.Sin(dn/2), 2)
	return 6371000 * 2 * math.Asin(math.Sqrt(math.Min(1, h)))
}
func (s *Server) route(ctx context.Context, a, b Point) (int64, int64, []RoutePoint, error) {
	return s.routeVia(ctx, []Point{a, b}, 100000, 86400, false)
}

// routeVia routes through every point in order. Outstation trips use a simplified overview and longer limits.
func (s *Server) routeVia(ctx context.Context, points []Point, maxMeters, maxSeconds float64, simplified bool) (int64, int64, []RoutePoint, error) {
	rs, e := s.routesVia(ctx, points, maxMeters, maxSeconds, simplified, false)
	if e != nil {
		return 0, 0, nil, e
	}
	return rs[0].Meters, rs[0].Seconds, rs[0].Route, nil
}

type routeOption struct {
	Meters  int64        `json:"meters"`
	Seconds int64        `json:"seconds"`
	Route   []RoutePoint `json:"route"`
}

// routesVia returns the best route first and, when alternatives is set, up to two more.
func (s *Server) routesVia(ctx context.Context, points []Point, maxMeters, maxSeconds float64, simplified, alternatives bool) ([]routeOption, error) {
	if s.Config.RoutingURL == "" {
		return nil, fmt.Errorf("routing is not configured")
	}
	coords := make([]string, len(points))
	for i, p := range points {
		coords[i] = fmt.Sprintf("%.6f,%.6f", p.Lng, p.Lat)
	}
	overview := "full"
	if simplified {
		overview = "simplified"
	}
	endpoint := fmt.Sprintf("%s/route/v1/driving/%s?overview=%s&geometries=geojson&alternatives=%t&steps=false", strings.TrimRight(s.Config.RoutingURL, "/"), strings.Join(coords, ";"), overview, alternatives)
	req, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	res, e := s.HTTP.Do(req)
	if e != nil {
		return nil, e
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("routing unavailable")
	}
	var result struct {
		Code   string `json:"code"`
		Routes []struct {
			Distance float64 `json:"distance"`
			Duration float64 `json:"duration"`
			Geometry struct {
				Coordinates [][]float64 `json:"coordinates"`
			} `json:"geometry"`
		} `json:"routes"`
	}
	if json.NewDecoder(http.MaxBytesReader(nil, res.Body, 4*1024*1024)).Decode(&result) != nil || result.Code != "Ok" || len(result.Routes) == 0 {
		return nil, fmt.Errorf("no road route")
	}
	var out []routeOption
	for i, route := range result.Routes {
		if i >= 3 {
			break
		}
		d, t := route.Distance, route.Duration
		if d < 100 || d > maxMeters || t < 1 || t > maxSeconds || math.IsNaN(d) || math.IsNaN(t) {
			if i == 0 {
				return nil, fmt.Errorf("route outside supported trip limits")
			}
			continue
		}
		if len(route.Geometry.Coordinates) < 2 || len(route.Geometry.Coordinates) > 10000 {
			if i == 0 {
				return nil, fmt.Errorf("route geometry unavailable")
			}
			continue
		}
		geometry := make([]RoutePoint, 0, len(route.Geometry.Coordinates))
		valid := true
		for _, coordinate := range route.Geometry.Coordinates {
			if len(coordinate) < 2 || math.IsNaN(coordinate[0]) || math.IsNaN(coordinate[1]) || coordinate[0] < 68 || coordinate[0] > 98 || coordinate[1] < 6 || coordinate[1] > 38 {
				valid = false
				break
			}
			geometry = append(geometry, RoutePoint{Lat: coordinate[1], Lng: coordinate[0]})
		}
		if !valid {
			if i == 0 {
				return nil, fmt.Errorf("invalid route geometry")
			}
			continue
		}
		tCalibrated := float64(trafficAdjustDuration(d, t, "", false))
		out = append(out, routeOption{int64(math.Ceil(d)), int64(math.Ceil(tCalibrated)), geometry})
	}
	return out, nil
}

// routeAlternatives lists up to three drivable routes so the rider can pick fastest or shortest.
func (s *Server) routeAlternatives(w http.ResponseWriter, r *http.Request) {
	if !s.limit(w, r, "routealt:"+user(r).Account.ID, 20, 60) {
		return
	}
	var in struct {
		Pickup  Point   `json:"pickup"`
		Dropoff Point   `json:"dropoff"`
		Stops   []Point `json:"stops"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.Stops) > 3 {
		fail(w, 400, "Too many stops")
		return
	}
	points := append(append([]Point{in.Pickup}, in.Stops...), in.Dropoff)
	routes, e := s.routesVia(r.Context(), points, 100000, 86400, false, true)
	if e != nil {
		fail(w, 503, "Routes are unavailable right now")
		return
	}
	write(w, 200, map[string]any{"routes": routes})
}

type quoteInput struct {
	AreaID          string  `json:"area_id"`
	VehicleCategory string  `json:"vehicle_category"`
	Pickup          Point   `json:"pickup"`
	Dropoff         Point   `json:"dropoff"`
	TripType        string  `json:"trip_type"`
	Stops           []Point `json:"stops"`
	RentalHours     int     `json:"rental_hours"`
	RoundTrip       bool    `json:"round_trip"`
	TripDays        int     `json:"trip_days"`
	PromoCode       string  `json:"promo_code"`
	Pink            bool    `json:"pink"`
	RouteIndex      int     `json:"route_index"`
}
type quoteError struct {
	Status  int
	Message string
}

func qerr(status int, message string) *quoteError { return &quoteError{status, message} }

func (s *Server) quote(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	if !s.limit(w, r, "quote:"+uid, 15, 60) {
		return
	}
	var input quoteInput
	if !decode(w, r, &input) {
		return
	}
	out, qe := s.buildQuote(r.Context(), uid, input)
	if qe != nil {
		if qe.Status == 0 {
			dbError(w, errQuoteDB)
			return
		}
		fail(w, qe.Status, qe.Message)
		return
	}
	write(w, 201, out)
}

var errQuoteDB = errors.New("quote database failure")

// buildQuote prices city (optionally multi-stop), hourly rental and outstation trips and stores the quote.
func (s *Server) buildQuote(ctx context.Context, uid string, input quoteInput) (map[string]any, *quoteError) {
	if input.VehicleCategory == "" {
		input.VehicleCategory = "bike"
	}
	if input.TripType == "" {
		input.TripType = "city"
	}
	if !validVehicleCategory(input.VehicleCategory) {
		return nil, qerr(400, "Choose a supported vehicle category")
	}
	if input.TripType != "city" && input.TripType != "rental" && input.TripType != "outstation" {
		return nil, qerr(400, "Unsupported trip type")
	}
	if !input.Pickup.valid() {
		return nil, qerr(400, "Choose a valid pickup")
	}
	if input.TripType == "rental" {
		input.Dropoff = Point{Lat: input.Pickup.Lat, Lng: input.Pickup.Lng, Label: "Hourly rental from " + input.Pickup.Label}
		if len(input.Dropoff.Label) > 160 {
			input.Dropoff.Label = input.Dropoff.Label[:160]
		}
	} else if !input.Dropoff.valid() {
		return nil, qerr(400, "Choose a valid destination")
	}
	if input.TripType == "city" && len(input.Stops) == 0 && distance(input.Pickup, input.Dropoff) < 100 {
		return nil, qerr(400, "Choose valid pickup and destination at least 100 metres apart")
	}
	if len(input.Stops) > 3 || (input.TripType != "city" && len(input.Stops) > 0) {
		return nil, qerr(400, "Extra stops are available for city rides only, up to 3")
	}
	var a Area
	e := s.DB.QueryRow(ctx, "SELECT id,min_lat,max_lat,min_lng,max_lng FROM areas WHERE id=$1 AND active", input.AreaID).Scan(&a.ID, &a.MinLat, &a.MaxLat, &a.MinLng, &a.MaxLng)
	if e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return nil, qerr(404, "Service area not found")
		}
		return nil, qerr(0, "")
	}
	if !a.contains(input.Pickup) {
		return nil, qerr(400, "Pickup must be inside the selected service area")
	}
	if input.TripType != "outstation" && !a.contains(input.Dropoff) {
		return nil, qerr(400, "Both locations must be inside the selected service area")
	}
	for _, stop := range input.Stops {
		if !stop.valid() || !a.contains(stop) {
			return nil, qerr(400, "Every stop must be a valid location inside the service area")
		}
	}
	var pricing VehiclePricing
	var stopFee, extraKM, allowance int64
	var hourly, outstationKM *int64
	var includedKM int
	e = s.DB.QueryRow(ctx, `SELECT area_id,category,base_paise,per_km_paise,minimum_paise,pricing_version,stop_fee_paise,hourly_paise,included_km_per_hour,extra_km_paise,outstation_per_km_paise,outstation_allowance_paise
 FROM area_vehicle_pricing WHERE area_id=$1 AND category=$2 AND enabled`, input.AreaID, input.VehicleCategory).
		Scan(&pricing.AreaID, &pricing.Category, &pricing.Base, &pricing.PerKM, &pricing.Minimum, &pricing.Version, &stopFee, &hourly, &includedKM, &extraKM, &outstationKM, &allowance)
	if e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return nil, qerr(409, "This vehicle category is not available in the selected service area")
		}
		return nil, qerr(0, "")
	}
	var meters, seconds, fare int64
	var route []RoutePoint
	breakdown := map[string]int64{"platform_fee_paise": 0}
	rentalHours, tripDays := 0, 1
	switch input.TripType {
	case "rental":
		if hourly == nil {
			return nil, qerr(409, "Hourly rental is not offered for this vehicle in this area")
		}
		if input.RentalHours < 1 || input.RentalHours > 12 {
			return nil, qerr(400, "Choose 1 to 12 rental hours")
		}
		rentalHours = input.RentalHours
		meters, seconds = int64(rentalHours*includedKM)*1000, int64(rentalHours)*3600
		fare = int64(rentalHours) * *hourly
		route = []RoutePoint{{Lat: input.Pickup.Lat, Lng: input.Pickup.Lng}, {Lat: input.Pickup.Lat, Lng: input.Pickup.Lng}}
		breakdown["hourly_paise"], breakdown["hours"], breakdown["included_km"], breakdown["extra_km_paise"] = *hourly, int64(rentalHours), int64(rentalHours*includedKM), extraKM
	case "outstation":
		if outstationKM == nil {
			return nil, qerr(409, "Outstation trips are not offered for this vehicle in this area")
		}
		if input.RoundTrip {
			tripDays = input.TripDays
			if tripDays < 1 || tripDays > 10 {
				return nil, qerr(400, "Choose 1 to 10 days for a round trip")
			}
		}
		var e error
		meters, seconds, route, e = s.routeVia(ctx, []Point{input.Pickup, input.Dropoff}, 1500000, 7*86400, true)
		if e != nil {
			return nil, qerr(503, "A road quote is unavailable. Please try again later")
		}
		seconds = trafficAdjustDuration(float64(meters), float64(seconds), input.VehicleCategory, true)
		if meters < 40000 {
			return nil, qerr(400, "Outstation trips must be at least 40 km; book a city ride instead")
		}
		legs := int64(1)
		if input.RoundTrip {
			legs = 2
		}
		distanceFare := (meters*legs**outstationKM + 999) / 1000
		fare = distanceFare + allowance*int64(tripDays)
		breakdown["distance_paise"], breakdown["driver_allowance_paise"], breakdown["days"], breakdown["round_trip"] = distanceFare, allowance*int64(tripDays), int64(tripDays), legs-1
	default:
		points := append(append([]Point{input.Pickup}, input.Stops...), input.Dropoff)
		var e error
		if input.RouteIndex < 0 || input.RouteIndex > 2 {
			return nil, qerr(400, "Unknown route choice")
		}
		options, e := s.routesVia(ctx, points, 100000, 86400, false, input.RouteIndex > 0)
		if e != nil || input.RouteIndex >= len(options) {
			return nil, qerr(503, "A road quote is unavailable. Please try again later")
		}
		meters, seconds, route = options[input.RouteIndex].Meters, options[input.RouteIndex].Seconds, options[input.RouteIndex].Route
		seconds = trafficAdjustDuration(float64(meters), float64(seconds), input.VehicleCategory, false)
		distanceFare := (meters*pricing.PerKM + 999) / 1000
		stopsFare := stopFee * int64(len(input.Stops))
		calculated := pricing.Base + distanceFare + stopsFare
		fare = max(pricing.Minimum, calculated)
		breakdown["base_paise"], breakdown["distance_paise"], breakdown["stops_paise"], breakdown["minimum_adjustment_paise"] = pricing.Base, distanceFare, stopsFare, fare-calculated
	}
	surge := surgeInfo{Multiplier: 1}
	if input.TripType != "outstation" {
		surge = s.surgeFor(ctx, s.DB, a.ID, pricing.Category)
		if surge.Multiplier > 1 {
			surged := applySurge(fare, surge.Multiplier)
			breakdown["surge_paise"], breakdown["surge_percent"] = surged-fare, int64(math.Round(surge.Multiplier*100))
			fare = surged
		}
	}
	var discount int64
	promoCode := ""
	if strings.TrimSpace(input.PromoCode) != "" {
		promo, qe := promoDiscount(ctx, s.DB, uid, input.PromoCode, a.ID, fare, false)
		if qe != nil {
			return nil, qe
		}
		discount, promoCode = promo.Discount, promo.Code
		breakdown["discount_paise"] = discount
	}
	breakdown["total_paise"] = fare
	breakdown["payable_paise"] = fare - discount
	if input.Pink {
		var gender string
		_ = s.DB.QueryRow(ctx, "SELECT COALESCE((SELECT gender FROM account_profiles WHERE account_id=$1),'')", uid).Scan(&gender)
		if gender != "female" {
			return nil, qerr(403, "Pink rides are for women travellers. Set your gender to female in Profile to use them.")
		}
	}
	var shared int64
	if sharedEligible(pricing.Category, input.TripType, len(input.Stops)) {
		shared = sharedFare(fare)
	}
	routeJSON, _ := json.Marshal(route)
	stopsJSON, _ := json.Marshal(input.Stops)
	if input.Stops == nil {
		stopsJSON = []byte("[]")
	}
	breakdownJSON, _ := json.Marshal(breakdown)
	var id string
	var expires time.Time
	var rental any
	if rentalHours > 0 {
		rental = rentalHours
	}
	e = s.DB.QueryRow(ctx, `INSERT INTO quotes(rider_id,area_id,pickup_lat,pickup_lng,pickup_label,dropoff_lat,dropoff_lng,dropoff_label,meters,seconds,fare_paise,pricing_version,route_geometry,route_source,vehicle_category,base_paise,per_km_paise,minimum_paise,trip_type,stops,rental_hours,round_trip,trip_days,breakdown,surge_multiplier,promo_code,discount_paise,pink,shared_fare_paise)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'osrm',$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NULLIF($25,''),$26,$27,NULLIF($28::bigint,0)) RETURNING id,expires_at`,
		uid, a.ID, input.Pickup.Lat, input.Pickup.Lng, input.Pickup.Label, input.Dropoff.Lat, input.Dropoff.Lng, input.Dropoff.Label, meters, seconds, fare, pricing.Version, routeJSON, pricing.Category, pricing.Base, pricing.PerKM, pricing.Minimum,
		input.TripType, stopsJSON, rental, input.RoundTrip && input.TripType == "outstation", tripDays, breakdownJSON, surge.Multiplier, promoCode, discount, input.Pink, shared).Scan(&id, &expires)
	if e != nil {
		return nil, qerr(0, "")
	}
	out := map[string]any{
		"id": id, "meters": meters, "seconds": seconds, "fare_paise": fare,
		"commission_paise": 0, "expires_at": expires, "pricing_version": pricing.Version,
		"vehicle_category": pricing.Category, "vehicle_name": vehicleNames[pricing.Category],
		"trip_type": input.TripType, "stops": input.Stops, "fare_breakdown": breakdown, "route": route,
		"surge_multiplier": surge.Multiplier, "surge_reason": surge.Reason, "promo_code": promoCode, "discount_paise": discount, "payable_paise": fare - discount,
	}
	if shared > 0 {
		out["shared_fare_paise"], out["shared_payable_paise"] = shared, max(0, shared-discount)
		out["shared_discount_percent"], out["share_wait_seconds"] = sharedDiscountPercent, shareWaitSeconds
	}
	return out, nil
}
