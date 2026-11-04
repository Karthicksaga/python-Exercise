package app

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http"
	"strings"
)

func (s *Server) operatorState(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	areas, e := jsonRows(ctx, s.DB, "SELECT * FROM areas ORDER BY state,name")
	if e != nil {
		dbError(w, e)
		return
	}
	pricing, e := jsonRows(ctx, s.DB, `SELECT area_id,category,base_paise,per_km_paise,minimum_paise,pricing_version,enabled FROM area_vehicle_pricing ORDER BY area_id,category`)
	if e != nil {
		dbError(w, e)
		return
	}
	drivers, e := jsonRows(ctx, s.DB, `SELECT d.user_id,d.area_id,d.status,d.vehicle_category,d.vehicle_number,d.license_reference,d.insurance_reference,d.license_expires,d.insurance_expires,d.review_note,a.name,a.email FROM drivers d JOIN accounts a ON a.id=d.user_id ORDER BY d.updated_at DESC LIMIT 100`)
	if e != nil {
		dbError(w, e)
		return
	}
	vehicleChanges, e := jsonRows(ctx, s.DB, `SELECT v.id,v.driver_id,a.name,d.vehicle_category AS current_category,d.vehicle_number AS current_number,v.vehicle_category,v.vehicle_number,v.created_at FROM vehicle_change_requests v JOIN drivers d ON d.user_id=v.driver_id JOIN accounts a ON a.id=v.driver_id WHERE v.status='pending' ORDER BY v.created_at`)
	if e != nil {
		dbError(w, e)
		return
	}
	areaChanges, e := jsonRows(ctx, s.DB, `SELECT a.id,a.driver_id,acc.name,d.area_id AS current_area_id,cur_ar.name AS current_area_name,cur_ar.state AS current_area_state,a.area_id AS requested_area_id,req_ar.name AS requested_area_name,req_ar.state AS requested_area_state,a.created_at FROM area_change_requests a JOIN drivers d ON d.user_id=a.driver_id JOIN accounts acc ON acc.id=a.driver_id JOIN areas cur_ar ON cur_ar.id=d.area_id JOIN areas req_ar ON req_ar.id=a.area_id WHERE a.status='pending' ORDER BY a.created_at`)
	if e != nil {
		dbError(w, e)
		return
	}
	incidents, e := jsonRows(ctx, s.DB, "SELECT id,ride_id,reporter_id,message,status,resolution,created_at FROM incidents ORDER BY created_at DESC LIMIT 100")
	if e != nil {
		dbError(w, e)
		return
	}
	events, e := jsonRows(ctx, s.DB, "SELECT id,actor_id,ride_id,action,detail,created_at FROM audit_events ORDER BY id DESC LIMIT 100")
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"areas": areas, "pricing": pricing, "drivers": drivers, "vehicle_changes": vehicleChanges, "area_changes": areaChanges, "incidents": incidents, "events": events})
}
func (s *Server) saveArea(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var a Area
	if !decode(w, r, &a) {
		return
	}
	if len(strings.TrimSpace(a.Name)) < 2 || len(a.Name) > 100 || len(a.State) < 2 || len(a.State) > 100 || a.Base < 0 || a.Base > 100000 || a.PerKM <= 0 || a.PerKM > 10000 || a.Minimum <= 0 || a.Minimum > 100000 || len(a.Approval) > 500 {
		fail(w, 400, "Invalid area or fare settings")
		return
	}
	if a.Active && len(strings.TrimSpace(a.Approval)) < 6 {
		fail(w, 400, "Activation requires an operator review reference")
		return
	}
	if !(a.MinLat >= 6 && a.MaxLat <= 38 && a.MinLat < a.MaxLat && a.MinLng >= 68 && a.MaxLng <= 98 && a.MinLng < a.MaxLng) {
		fail(w, 400, "Zone bounds must be inside India, with south below north and west below east")
		return
	}
	ctx := r.Context()
	if a.CatalogID != "" {
		var holder string
		e := s.DB.QueryRow(ctx, `SELECT COALESCE((SELECT name FROM areas WHERE catalog_id=$1 AND id::text<>$2),'') FROM region_catalog WHERE id=$1`, a.CatalogID, a.ID).Scan(&holder)
		if errors.Is(e, pgx.ErrNoRows) {
			fail(w, 400, "Unknown district")
			return
		}
		if e != nil {
			dbError(w, e)
			return
		}
		if holder != "" {
			fail(w, 409, "This district already has a zone: "+holder)
			return
		}
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if a.Active {
		// Two live zones covering the same streets would give riders there an ambiguous zone.
		// The transaction lock makes zone activations take turns, so two can't race past this check.
		var clash string
		if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext('areas.activation'))"); e == nil {
			e = tx.QueryRow(ctx, `SELECT COALESCE((SELECT name FROM areas WHERE active AND id::text<>$1
 AND min_lat<$3 AND max_lat>$2 AND min_lng<$5 AND max_lng>$4 ORDER BY name LIMIT 1),'')`,
				a.ID, a.MinLat, a.MaxLat, a.MinLng, a.MaxLng).Scan(&clash)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		if clash != "" {
			fail(w, 409, "This zone overlaps "+clash+", which is taking bookings. Shrink it before opening bookings.")
			return
		}
	}
	if a.ID == "" {
		e = tx.QueryRow(ctx, `INSERT INTO areas(name,state,min_lat,max_lat,min_lng,max_lng,base_paise,per_km_paise,minimum_paise,active,approval_reference,catalog_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12,'')) RETURNING id`, a.Name, a.State, a.MinLat, a.MaxLat, a.MinLng, a.MaxLng, a.Base, a.PerKM, a.Minimum, a.Active, a.Approval, a.CatalogID).Scan(&a.ID)
	} else {
		var tag pgconn.CommandTag
		tag, e = tx.Exec(ctx, `UPDATE areas SET name=$2,state=$3,min_lat=$4,max_lat=$5,min_lng=$6,max_lng=$7,base_paise=$8,per_km_paise=$9,minimum_paise=$10,active=$11,approval_reference=$12,catalog_id=COALESCE(NULLIF($13,''),catalog_id),pricing_version=pricing_version+1 WHERE id=$1`, a.ID, a.Name, a.State, a.MinLat, a.MaxLat, a.MinLng, a.MaxLng, a.Base, a.PerKM, a.Minimum, a.Active, a.Approval, a.CatalogID)
		if e == nil && tag.RowsAffected() == 0 {
			fail(w, 404, "Area not found")
			return
		}
	}
	if e == nil {
		_, e = tx.Exec(ctx, `INSERT INTO area_vehicle_pricing(area_id,category,base_paise,per_km_paise,minimum_paise,enabled)
 VALUES($1,'bike',$2,$3,$4,$5)
 ON CONFLICT(area_id,category) DO UPDATE SET base_paise=EXCLUDED.base_paise,per_km_paise=EXCLUDED.per_km_paise,
 minimum_paise=EXCLUDED.minimum_paise,enabled=EXCLUDED.enabled,pricing_version=area_vehicle_pricing.pricing_version+1,updated_at=now()`,
			a.ID, a.Base, a.PerKM, a.Minimum, a.Active)
	}
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "area_updated", a)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]string{"id": a.ID})
}

// operatorRegions lists catalogue districts (optionally one state) with the zone already using each.
func (s *Server) operatorRegions(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	rows, e := jsonRows(r.Context(), s.DB, `SELECT c.id,c.state,c.district,c.min_lat,c.max_lat,c.min_lng,c.max_lng,c.centre_lat,c.centre_lng,c.source,
 c.city,c.city_source,c.city_min_lat,c.city_max_lat,c.city_min_lng,c.city_max_lng,
 a.id AS area_id,a.name AS area_name,COALESCE(a.active,false) AS area_active
 FROM region_catalog c LEFT JOIN areas a ON a.catalog_id=c.id
 WHERE $1='' OR c.state=$1 ORDER BY c.state,c.district`, strings.TrimSpace(r.URL.Query().Get("state")))
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"regions": rows})
}

func (s *Server) saveVehiclePricing(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		AreaID   string `json:"area_id"`
		Category string `json:"category"`
		Base     int64  `json:"base_paise"`
		PerKM    int64  `json:"per_km_paise"`
		Minimum  int64  `json:"minimum_paise"`
		Enabled  bool   `json:"enabled"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validVehicleCategory(in.Category) || in.Category == "bike" || in.Base < 0 || in.Base > 100000 || in.PerKM <= 0 || in.PerKM > 10000 || in.Minimum <= 0 || in.Minimum > 100000 {
		fail(w, 400, "Invalid non-bike category or fare settings")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var areaActive bool
	e = tx.QueryRow(ctx, "SELECT active FROM areas WHERE id=$1 FOR UPDATE", in.AreaID).Scan(&areaActive)
	if e != nil {
		dbError(w, e)
		return
	}
	if in.Enabled && !areaActive {
		fail(w, 409, "Activate the service area before enabling vehicle bookings")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO area_vehicle_pricing(area_id,category,base_paise,per_km_paise,minimum_paise,enabled)
 VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(area_id,category) DO UPDATE SET base_paise=EXCLUDED.base_paise,per_km_paise=EXCLUDED.per_km_paise,
 minimum_paise=EXCLUDED.minimum_paise,enabled=EXCLUDED.enabled,pricing_version=area_vehicle_pricing.pricing_version+1,updated_at=now()`,
		in.AreaID, in.Category, in.Base, in.PerKM, in.Minimum, in.Enabled)
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "vehicle_pricing_updated", in)
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

// reviewDriver is retired: driver approval has a single code path with one set of rules
// (POST /api/admin/drivers/{id}), so older clients cannot bypass document checks.
func (s *Server) reviewDriver(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	fail(w, 410, "This endpoint is retired. Use POST /api/admin/drivers/{id}.")
}

func (s *Server) reviewIncident(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Status     string `json:"status"`
		Resolution string `json:"resolution"`
	}
	if !decode(w, r, &in) {
		return
	}
	if (in.Status != "reviewing" && in.Status != "closed") || len(strings.TrimSpace(in.Resolution)) < 5 || len(in.Resolution) > 2000 {
		fail(w, 400, "Choose a status and provide a resolution note")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var ride string
	e = tx.QueryRow(ctx, "UPDATE incidents SET status=$2,resolution=$3,updated_by=$4,updated_at=now() WHERE id=$1 RETURNING ride_id", r.PathValue("id"), in.Status, in.Resolution, user(r).Account.ID).Scan(&ride)
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, ride, "incident_reviewed", map[string]string{"id": r.PathValue("id"), "status": in.Status})
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

// operatorSummary returns the counts behind the console's Overview "Needs attention" list and
// zone table in one round trip. Each count uses the same rule as the screen it links to.
func (s *Server) operatorSummary(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	var sum struct {
		SOSActive      int     `json:"sos_active"`
		IncidentsOpen  int     `json:"incidents_open"`
		DriversPending int     `json:"drivers_pending"`
		OldestPending  *string `json:"oldest_pending_at"`
		ChangesPending int     `json:"changes_pending"`
		Expiring7      int     `json:"expiring_7d"`
		PayoutsWaiting int     `json:"payouts_requested"`
		PayoutsPaise   int64   `json:"payouts_requested_paise"`
		LostOpen       int     `json:"lost_open"`
		ActiveRides    int     `json:"active_rides"`
	}
	e := s.DB.QueryRow(ctx, `SELECT
 (SELECT count(*) FROM sos_events x LEFT JOIN incidents i ON i.id=x.incident_id WHERE COALESCE(i.status,'open')<>'closed'),
 (SELECT count(*) FROM incidents WHERE status<>'closed'),
 (SELECT count(*) FROM drivers WHERE status='pending'),
 (SELECT to_char(min(submitted_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM drivers WHERE status='pending'),
 (SELECT count(*) FROM vehicle_change_requests WHERE status='pending')+(SELECT count(*) FROM area_change_requests WHERE status='pending'),
 (SELECT count(*) FROM drivers WHERE status='approved' AND LEAST(license_expires,insurance_expires) <= (now() AT TIME ZONE 'Asia/Kolkata')::date + 7),
 (SELECT count(*) FROM driver_payouts WHERE status='requested'),
 (SELECT COALESCE(sum(amount_paise),0) FROM driver_payouts WHERE status='requested'),
 (SELECT count(*) FROM lost_items WHERE status='open'),
 (SELECT count(*) FROM rides WHERE status IN ('requested','accepted','arrived','in_progress'))`).Scan(
		&sum.SOSActive, &sum.IncidentsOpen, &sum.DriversPending, &sum.OldestPending, &sum.ChangesPending,
		&sum.Expiring7, &sum.PayoutsWaiting, &sum.PayoutsPaise, &sum.LostOpen, &sum.ActiveRides)
	if e != nil {
		dbError(w, e)
		return
	}
	areas, e := jsonRows(ctx, s.DB, `SELECT a.id,a.name,a.state,a.active,
 COALESCE((SELECT array_agg(p.category ORDER BY array_position(ARRAY['bike','auto','mini','sedan','suv'],p.category))
   FROM area_vehicle_pricing p WHERE p.area_id=a.id AND p.enabled),'{}') AS categories,
 (SELECT count(*) FROM drivers d WHERE d.area_id=a.id AND d.online AND d.status='approved') AS captains_online,
 (SELECT o.multiplier FROM surge_overrides o WHERE o.area_id=a.id AND o.ends_at>now() ORDER BY o.multiplier DESC LIMIT 1) AS surge_multiplier,
 (SELECT o.reason FROM surge_overrides o WHERE o.area_id=a.id AND o.ends_at>now() ORDER BY o.multiplier DESC LIMIT 1) AS surge_reason
 FROM areas a ORDER BY a.active DESC,a.state,a.name`)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"summary": sum, "areas": areas})
}
