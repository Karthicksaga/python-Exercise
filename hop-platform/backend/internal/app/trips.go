package app

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// saveTripPricing lets operators enable multi-stop fees, hourly rental and outstation pricing for an existing vehicle product.
func (s *Server) saveTripPricing(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		AreaID                   string `json:"area_id"`
		Category                 string `json:"category"`
		StopFeePaise             int64  `json:"stop_fee_paise"`
		HourlyPaise              *int64 `json:"hourly_paise"`
		IncludedKMPerHour        int    `json:"included_km_per_hour"`
		ExtraKMPaise             int64  `json:"extra_km_paise"`
		OutstationPerKMPaise     *int64 `json:"outstation_per_km_paise"`
		OutstationAllowancePaise int64  `json:"outstation_allowance_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validVehicleCategory(in.Category) || in.StopFeePaise < 0 || in.StopFeePaise > 10000 || in.IncludedKMPerHour < 1 || in.IncludedKMPerHour > 100 ||
		in.ExtraKMPaise < 0 || in.ExtraKMPaise > 10000 || in.OutstationAllowancePaise < 0 || in.OutstationAllowancePaise > 500000 ||
		(in.HourlyPaise != nil && (*in.HourlyPaise < 1 || *in.HourlyPaise > 500000)) ||
		(in.OutstationPerKMPaise != nil && (*in.OutstationPerKMPaise < 1 || *in.OutstationPerKMPaise > 10000)) {
		fail(w, 400, "Invalid trip pricing values")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	tag, e := tx.Exec(ctx, `UPDATE area_vehicle_pricing SET stop_fee_paise=$3,hourly_paise=$4,included_km_per_hour=$5,extra_km_paise=$6,
 outstation_per_km_paise=$7,outstation_allowance_paise=$8,pricing_version=pricing_version+1,updated_at=now() WHERE area_id=$1 AND category=$2`,
		in.AreaID, in.Category, in.StopFeePaise, in.HourlyPaise, in.IncludedKMPerHour, in.ExtraKMPaise, in.OutstationPerKMPaise, in.OutstationAllowancePaise)
	if e == nil && tag.RowsAffected() == 0 {
		fail(w, 404, "Configure the vehicle category for this area first")
		return
	}
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "trip_pricing_updated", in)
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

type dueSchedule struct {
	ID, Rider, Area, Category, PickupLabel, DropLabel, Payment string
	PLat, PLng, DLat, DLng                                     float64
	For                                                        time.Time
}

// DispatchScheduled turns scheduled rides that are within 15 minutes of pickup into live ride requests.
func (s *Server) DispatchScheduled(ctx context.Context) error {
	rows, e := s.DB.Query(ctx, `SELECT id,rider_id,area_id,category,pickup_label,dropoff_label,payment_method,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,scheduled_for
 FROM scheduled_rides WHERE status='scheduled' AND scheduled_for<=now()+interval '15 minutes' ORDER BY scheduled_for LIMIT 20`)
	if e != nil {
		return e
	}
	due, e := pgx.CollectRows(rows, func(r pgx.CollectableRow) (d dueSchedule, e error) {
		e = r.Scan(&d.ID, &d.Rider, &d.Area, &d.Category, &d.PickupLabel, &d.DropLabel, &d.Payment, &d.PLat, &d.PLng, &d.DLat, &d.DLng, &d.For)
		return
	})
	if e != nil {
		return e
	}
	for _, d := range due {
		if e := s.dispatchOne(ctx, d); e != nil {
			return e
		}
	}
	return nil
}

func (s *Server) finishSchedule(ctx context.Context, d dueSchedule, status, reason, rideID string) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	tag, e := tx.Exec(ctx, `UPDATE scheduled_rides SET status=$2,failure_reason=$3,dispatched_ride_id=NULLIF($4,'')::uuid WHERE id=$1 AND status='scheduled'`, d.ID, status, reason, rideID)
	if e != nil || tag.RowsAffected() == 0 {
		return e
	}
	title, body := "Scheduled ride requested", "We're finding a driver for your "+d.For.Local().Format("15:04")+" ride."
	if status == "failed" {
		title, body = "Scheduled ride could not be booked", reason
	}
	if e = notify(ctx, tx, d.Rider, "scheduled_ride", title, body); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

func (s *Server) dispatchOne(ctx context.Context, d dueSchedule) error {
	if time.Since(d.For) > 10*time.Minute {
		return s.finishSchedule(ctx, d, "failed", "The scheduled time passed before the ride could be dispatched.", "")
	}
	quote, qe := s.buildQuote(ctx, d.Rider, quoteInput{AreaID: d.Area, VehicleCategory: d.Category, TripType: "city",
		Pickup: Point{Lat: d.PLat, Lng: d.PLng, Label: d.PickupLabel}, Dropoff: Point{Lat: d.DLat, Lng: d.DLng, Label: d.DropLabel}})
	if qe != nil {
		if qe.Status == 0 {
			return errQuoteDB
		}
		return s.finishSchedule(ctx, d, "failed", qe.Message, "")
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = lockJourney(ctx, tx, d.Rider); e != nil {
		return e
	}
	var driving bool
	if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM drivers WHERE user_id=$1 AND online)
 OR EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress'))`, d.Rider).Scan(&driving); e != nil {
		return e
	}
	if driving {
		// Keep the schedule pending within its existing dispatch window. Never switch
		// a working driver offline or create a conflicting passenger trip silently.
		return nil
	}
	if e = expire(ctx, tx, d.Rider); e != nil {
		return e
	}
	var rideID string
	e = tx.QueryRow(ctx, `INSERT INTO rides(quote_id,rider_id,request_key,payment_method,expires_at)
 SELECT $1::uuid,$2::uuid,gen_random_uuid(),$3::text,greatest(now()+interval '5 minutes',$4::timestamptz+interval '5 minutes')
 WHERE EXISTS(SELECT 1 FROM scheduled_rides WHERE id=$5::uuid AND status='scheduled') RETURNING id`, quote["id"], d.Rider, d.Payment, d.For, d.ID).Scan(&rideID)
	var pg *pgconn.PgError
	if errors.As(e, &pg) && pg.Code == "23505" {
		tx.Rollback(ctx)
		return s.finishSchedule(ctx, d, "failed", "You already had an active ride at pickup time.", "")
	}
	if e != nil {
		return e
	}
	if e = audit(ctx, tx, d.Rider, rideID, "requested", map[string]any{"scheduled_ride_id": d.ID, "payment_method": d.Payment}); e != nil {
		return e
	}
	if e = tx.Commit(ctx); e != nil {
		return e
	}
	return s.finishSchedule(ctx, d, "dispatched", "", rideID)
}
