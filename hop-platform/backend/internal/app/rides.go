package app

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const rideSelect = `SELECT r.id,r.status,r.version,r.payment_method,r.payment_status,r.created_at,r.expires_at,r.cancel_reason,
 q.pickup_label,q.dropoff_label,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng,q.meters,q.seconds,COALESCE(r.offered_fare_paise,q.fare_paise) AS fare_paise,q.fare_paise AS quoted_fare_paise,r.offered_fare_paise IS NOT NULL AND r.share_state='none' AND r.wait_charge_paise=0 AS negotiated,r.wait_charge_paise,r.group_id,r.group_leader,r.share_state,r.share_until,q.trip_type,q.stops,q.rental_hours,q.round_trip,q.trip_days,q.breakdown,q.area_id,q.route_geometry AS route,
 q.vehicle_category,q.base_paise,q.per_km_paise,q.minimum_paise,r.passenger_name,r.passenger_phone,CASE WHEN r.rider_id=$1::uuid OR r.driver_id=$1::uuid THEN r.pickup_instructions ELSE '' END AS pickup_instructions,
 r.rider_id=$1::uuid AS mine,r.driver_id=$1::uuid AS driving,
 CASE WHEN r.driver_id IS NOT NULL THEN d.vehicle_number ELSE '' END AS vehicle_number,
 CASE WHEN r.driver_id IS NOT NULL THEN da.name ELSE '' END AS driver_name,
 CASE WHEN r.driver_id IS NOT NULL THEN d.vehicle_make ELSE '' END AS vehicle_make,
 CASE WHEN r.driver_id IS NOT NULL THEN d.vehicle_model ELSE '' END AS vehicle_model,
 CASE WHEN r.driver_id IS NOT NULL THEN d.vehicle_color ELSE '' END AS vehicle_color,
 CASE WHEN r.driver_id IS NOT NULL THEN r.driver_id::text ELSE '' END AS driver_id,
 EXISTS(SELECT 1 FROM profile_photos f WHERE f.account_id=r.driver_id AND f.approved) AS driver_has_photo,
 CASE WHEN r.driver_id IS NOT NULL AND r.rider_id=$1::uuid AND r.payment_method='upi' THEN d.upi_id ELSE '' END AS driver_upi,
 CASE WHEN r.driver_id=$1::uuid THEN ra.name ELSE '' END AS rider_name,
 CASE WHEN r.rider_id=$1::uuid AND r.status IN ('accepted','arrived','in_progress') AND d.location_at>now()-interval '60 seconds' THEN d.lat ELSE NULL END AS driver_lat,
 CASE WHEN r.rider_id=$1::uuid AND r.status IN ('accepted','arrived','in_progress') AND d.location_at>now()-interval '60 seconds' THEN d.lng ELSE NULL END AS driver_lng
 ,(SELECT round(avg(score)::numeric,1)::float8 FROM ride_ratings WHERE rated_id=r.driver_id) AS driver_rating,(SELECT count(*) FROM ride_ratings WHERE rated_id=r.driver_id) AS driver_rating_count,(SELECT count(*) FROM rides c WHERE c.driver_id=r.driver_id AND c.status='completed') AS driver_trips
 ,myrating.score AS my_rating,myrating.comment AS my_rating_comment
 ,q.discount_paise,q.surge_multiplier::float8 AS surge_multiplier,q.promo_code,q.pink,GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise) AS payable_paise,r.full_fare_status,r.adjusted_from_paise,r.covered_meters
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts ra ON ra.id=r.rider_id LEFT JOIN drivers d ON d.user_id=r.driver_id LEFT JOIN accounts da ON da.id=r.driver_id
 LEFT JOIN ride_ratings myrating ON myrating.ride_id=r.id AND myrating.rater_id=$1::uuid`

// offerFrom lists the rides a driver ($1) may currently see or bid on.
var offerFrom = `
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN areas a ON a.id=q.area_id JOIN drivers d ON d.user_id=$1
 WHERE r.status='requested' AND r.expires_at>now() AND r.rider_id<>$1 AND r.share_state<>'waiting' AND (r.group_id IS NULL OR r.group_leader) AND d.status='approved' AND d.online AND a.active AND d.area_id=q.area_id AND d.vehicle_category=q.vehicle_category
 AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.location_at>now()-interval '60 seconds'
 AND (r.payment_method<>'upi' OR d.upi_id<>'') AND COALESCE(r.offered_fare_paise,q.fare_paise)+` + groupFareExtra + `>=d.minimum_fare_paise
 AND (r.favorite_first_until IS NULL OR r.favorite_first_until<=now() OR EXISTS(SELECT 1 FROM favorite_drivers f WHERE f.rider_id=r.rider_id AND f.driver_id=d.user_id))
 AND (r.reserved_until IS NULL OR r.reserved_until<=now() OR r.reserved_driver_id=d.user_id)
 AND (r.reserved_driver_id=d.user_id OR EXISTS(SELECT 1 FROM ride_offers o WHERE o.ride_id=r.id AND o.driver_id=d.user_id))
 AND 6371000*acos(least(1,greatest(-1,sin(radians(d.lat))*sin(radians(q.pickup_lat))+cos(radians(d.lat))*cos(radians(q.pickup_lat))*cos(radians(d.lng-q.pickup_lng)))))<=d.pickup_radius_meters
 AND NOT EXISTS(SELECT 1 FROM ride_declines dc WHERE dc.ride_id=r.id AND dc.driver_id=d.user_id)
 AND NOT EXISTS(SELECT 1 FROM rides busy WHERE busy.driver_id=d.user_id AND busy.status IN ('accepted','arrived','in_progress'))` + riderBusyFilter + goHomeFilter

func (s *Server) state(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	rides, e := jsonRows(r.Context(), s.DB, rideSelect+" WHERE r.rider_id=$1 OR r.driver_id=$1 ORDER BY r.created_at DESC LIMIT 50", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	var list []map[string]any
	if json.Unmarshal(rides, &list) != nil {
		fail(w, 500, "Invalid ride state")
		return
	}
	for _, ride := range list {
		if ride["mine"] == true && ride["status"] == "requested" {
			bids, e := jsonRows(r.Context(), s.DB, `SELECT b.id,b.amount_paise,split_part(a.name,' ',1) AS driver_name,d.vehicle_number
 FROM ride_bids b JOIN drivers d ON d.user_id=b.driver_id JOIN accounts a ON a.id=b.driver_id WHERE b.ride_id=$1 ORDER BY b.amount_paise`, ride["id"])
			if e != nil {
				dbError(w, e)
				return
			}
			ride["bids"] = bids
			var name string
			var until time.Time
			if s.DB.QueryRow(r.Context(), `SELECT split_part(a.name,' ',1),r.reserved_until FROM rides r JOIN accounts a ON a.id=r.reserved_driver_id WHERE r.id=$1 AND r.reserved_until>now()`, ride["id"]).Scan(&name, &until) == nil {
				ride["reserved_driver_name"] = name
				ride["reserved_until"] = until
			}
		}
		if ride["mine"] == true && ride["status"] == "requested" {
			var n, stage int
			if s.DB.QueryRow(r.Context(), "SELECT (SELECT count(*) FROM ride_offers WHERE ride_id=$1), dispatch_stage FROM rides WHERE id=$1", ride["id"]).Scan(&n, &stage) == nil {
				ride["search_radius_m"] = stageRadius[max(0, min(stage, len(stageRadius))-1)]
				ride["dispatch_stage"] = stage
				ride["notified_drivers"] = n
			}
		}
		if ride["mine"] == true && (ride["status"] == "accepted" || ride["status"] == "arrived" || ride["status"] == "in_progress") {
			// The database copy is a checkpoint (up to ~10 s old); the live layer has the exact latest ping.
			var driverID string
			if s.DB.QueryRow(r.Context(), "SELECT driver_id::text FROM rides WHERE id=$1 AND driver_id IS NOT NULL", ride["id"]).Scan(&driverID) == nil {
				if lat, lng, _, ok := s.liveDriverPos(r.Context(), driverID); ok {
					ride["driver_lat"], ride["driver_lng"] = lat, lng
				}
			}
		}
		if ride["mine"] == true && (ride["status"] == "accepted" || ride["status"] == "arrived") {
			ride["pickup_code"] = s.pin(ride["id"].(string))
		}
	}
	s.shareView(r.Context(), uid, list)
	s.addETAs(r.Context(), list)
	vehicleChange, e := jsonRows(r.Context(), s.DB, "SELECT id,vehicle_category,vehicle_number,status,review_note,created_at FROM vehicle_change_requests WHERE driver_id=$1 ORDER BY created_at DESC LIMIT 1", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	areaChange, e := jsonRows(r.Context(), s.DB, "SELECT a.id,a.area_id,ar.name AS area_name,ar.state AS area_state,a.status,a.review_note,a.created_at FROM area_change_requests a JOIN areas ar ON ar.id=a.area_id WHERE a.driver_id=$1 ORDER BY a.created_at DESC LIMIT 1", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	driver, e := jsonRows(r.Context(), s.DB, `SELECT user_id,area_id,status,vehicle_number,vehicle_category,vehicle_make,vehicle_model,vehicle_color,onboarding_version,upi_id,license_reference,insurance_reference,license_expires,insurance_expires,review_note,online,location_at,pickup_radius_meters,minimum_fare_paise,home_lat,home_lng,home_until,home_uses,home_uses_on,daily_goal_paise,lat,lng FROM drivers WHERE user_id=$1`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	// The SQL proximity filter is an inexpensive candidate filter; acceptance repeats exact distance validation.
	offers, e := jsonRows(r.Context(), s.DB, `SELECT r.id,r.version,r.group_id,r.share_state,q.pickup_label,q.dropoff_label,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng,q.meters,q.seconds,COALESCE(r.offered_fare_paise,q.fare_paise)+`+groupFareExtra+` AS fare_paise,q.fare_paise AS quoted_fare_paise,r.offered_fare_paise IS NOT NULL AND r.share_state='none' AS negotiated,
 (SELECT amount_paise FROM ride_bids b WHERE b.ride_id=r.id AND b.driver_id=$1) AS my_bid_paise,q.trip_type,q.stops,q.rental_hours,q.vehicle_category,q.pink,q.route_geometry AS route,r.payment_method,r.expires_at,($2::boolean AND r.circle_until>now()) AS circle_invitation`+s.circleOfferFrom()+` ORDER BY r.created_at LIMIT 20`, uid, s.Config.Features.HopCircle)
	if e != nil {
		dbError(w, e)
		return
	}
	var offerList []map[string]any
	if json.Unmarshal(offers, &offerList) == nil && len(offerList) > 0 {
		var at Point
		if s.DB.QueryRow(r.Context(), "SELECT lat,lng FROM drivers WHERE user_id=$1", uid).Scan(&at.Lat, &at.Lng) == nil {
			s.shareOffers(r.Context(), at, offerList)
			offers, _ = json.Marshal(offerList)
		}
	}
	incidents, e := jsonRows(r.Context(), s.DB, "SELECT id,ride_id,message,status,resolution,created_at FROM incidents WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 20", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	locations, e := jsonRows(r.Context(), s.DB, "SELECT id,label,kind,lat,lng,place_label FROM saved_locations WHERE account_id=$1 ORDER BY kind,label", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"rides": list, "driver": driver, "offers": offers, "vehicle_change": vehicleChange, "area_change": areaChange, "incidents": incidents, "saved_locations": locations})
}
func (s *Server) book(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	if !s.limit(w, r, "book:"+uid, 10, 60) {
		return
	}
	var input struct {
		Circle             bool   `json:"circle"`
		CircleCaptainID    string `json:"circle_captain_id"`
		PickupInstructions string `json:"pickup_instructions"`
		QuoteID            string `json:"quote_id"`
		RequestKey         string `json:"request_key"`
		Payment            string `json:"payment_method"`
		// Optional: ride for someone else, a family member, and favorite-driver-first dispatch.
		FamilyMemberID string `json:"family_member_id"`
		PassengerName  string `json:"passenger_name"`
		PassengerPhone string `json:"passenger_phone"`
		FavoriteFirst  bool   `json:"favorite_first"`
		OfferPaise     *int64 `json:"offer_paise"`
		Share          bool   `json:"share"`
		GoOffline      bool   `json:"go_offline"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.PickupInstructions = strings.TrimSpace(input.PickupInstructions)
	if utf8.RuneCountInString(input.PickupInstructions) > 250 {
		fail(w, 400, "Pickup instructions must be 250 characters or fewer")
		return
	}
	if input.Payment != "cash" && input.Payment != "upi" && input.Payment != "wallet" {
		fail(w, 400, "Choose cash, direct UPI or wallet")
		return
	}
	input.PassengerName = strings.TrimSpace(input.PassengerName)
	input.PassengerPhone = strings.TrimSpace(input.PassengerPhone)
	if input.FamilyMemberID != "" && (input.PassengerName != "" || input.PassengerPhone != "") {
		fail(w, 400, "Choose either a family member or another person")
		return
	}
	if input.FamilyMemberID == "" && (input.PassengerName != "" || input.PassengerPhone != "") {
		name, ok := cleanText(input.PassengerName, 2, 80)
		if !ok || !validPhone(input.PassengerPhone) {
			fail(w, 400, "Provide the passenger's name and a 10-digit Indian mobile number")
			return
		}
		input.PassengerName = name
	}
	ctx := r.Context()
	if !hasMobile(ctx, s.DB, uid) {
		fail(w, 403, mobileRequired)
		return
	}
	if input.Share && (input.OfferPaise != nil || input.FavoriteFirst) {
		fail(w, 400, "A shared ride cannot be combined with a custom offer or favourite-driver-first")
		return
	}
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
	if !hasMobile(ctx, tx, uid) {
		fail(w, 403, mobileRequired)
		return
	}
	// Lock the rider before checking idempotency so concurrent retried requests have the same result.
	var lock string
	e = tx.QueryRow(ctx, "SELECT id FROM accounts WHERE id=$1 FOR UPDATE", uid).Scan(&lock)
	if e != nil {
		dbError(w, e)
		return
	}
	var existing, oldQuote, oldPayment, oldCircleCaptain string
	var oldCircle bool
	e = tx.QueryRow(ctx, "SELECT id,quote_id,payment_method,circle_requested,COALESCE(circle_captain_id::text,'') FROM rides WHERE rider_id=$1 AND request_key=$2", uid, input.RequestKey).Scan(&existing, &oldQuote, &oldPayment, &oldCircle, &oldCircleCaptain)
	if e == nil {
		if oldQuote != input.QuoteID || oldPayment != input.Payment || oldCircle != input.Circle || oldCircleCaptain != input.CircleCaptainID {
			fail(w, 409, "Request key was already used for a different booking")
			return
		}
		write(w, 200, map[string]string{"id": existing})
		return
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		dbError(w, e)
		return
	}
	// Existing retries are resolved above, including when the feature is disabled.
	if input.CircleCaptainID != "" && !input.Circle {
		fail(w, 400, "Choose Hop Circle before selecting a Captain")
		return
	}
	if input.Circle {
		if !s.Config.Features.HopCircle {
			fail(w, 404, "Hop Circle is not enabled")
			return
		}
		if input.Share || input.FavoriteFirst {
			fail(w, 400, "Choose Circle separately from shared rides and legacy favorite-first")
			return
		}
		var parsed pgtype.UUID
		if input.CircleCaptainID != "" && parsed.Scan(input.CircleCaptainID) != nil {
			fail(w, 400, "Invalid Captain identifier")
			return
		}
		var eligible bool
		e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM favorite_drivers f JOIN drivers d ON d.user_id=f.driver_id
   JOIN circle_captain_preferences cp ON cp.captain_id=d.user_id AND cp.opted_in
   WHERE f.rider_id=$1 AND d.status='approved' AND ($2::text='' OR d.user_id=NULLIF($2,'')::uuid)
   AND NOT EXISTS(SELECT 1 FROM circle_blocks b WHERE b.captain_id=d.user_id AND b.rider_id=$1))`, uid, input.CircleCaptainID).Scan(&eligible)
		if e != nil {
			dbError(w, e)
			return
		}
		if !eligible {
			fail(w, 409, "No participating Circle Captain is available for preferred requests; choose normal matching")
			return
		}
	}
	var driving, online bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress')), EXISTS(SELECT 1 FROM drivers WHERE user_id=$1 AND online)", uid).Scan(&driving, &online); e != nil {
		dbError(w, e)
		return
	}
	if driving {
		fail(w, 409, "Finish or cancel your driver trip in Captain before booking a ride")
		return
	}
	if online && !input.GoOffline {
		write(w, 409, map[string]string{"error": "Go offline in Captain before booking a ride", "code": "driver_online"})
		return
	}
	if _, e = tx.Exec(ctx, "UPDATE drivers SET online=false,updated_at=now() WHERE user_id=$1 AND online", uid); e != nil {
		dbError(w, e)
		return
	}
	// Expiration and its audit event are written atomically before releasing the active-rider constraint.
	if e = expire(ctx, tx, uid); e != nil {
		dbError(w, e)
		return
	}
	var quotedFare, discount, sharedPrice int64
	var promoCode, quoteArea string
	if e = tx.QueryRow(ctx, "SELECT fare_paise,discount_paise,COALESCE(promo_code,''),area_id,COALESCE(shared_fare_paise,0) FROM quotes WHERE id=$1 AND rider_id=$2", input.QuoteID, uid).Scan(&quotedFare, &discount, &promoCode, &quoteArea, &sharedPrice); e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			fail(w, 409, "Quote expired or service area unavailable; request a fresh quote")
			return
		}
		dbError(w, e)
		return
	}
	if input.Share {
		if sharedPrice == 0 {
			fail(w, 400, "Sharing is not available for this ride")
			return
		}
		input.OfferPaise = &sharedPrice
	}
	if input.OfferPaise != nil && !fareWithinBounds(*input.OfferPaise, quotedFare) {
		fail(w, 400, "Your offer must be between 70% and 150% of the quoted fare")
		return
	}
	payable := max(0, offerOrQuote(input.OfferPaise, quotedFare)-discount)
	if input.Payment == "wallet" {
		if _, e = tx.Exec(ctx, "SELECT 1 FROM accounts WHERE id=$1 FOR UPDATE", uid); e == nil {
			var bal int64
			if bal, e = walletBalance(ctx, tx, uid); e == nil && bal < payable {
				fail(w, 402, "Your wallet balance is too low for this ride. Add money or choose another payment method")
				return
			}
		}
		if e != nil {
			dbError(w, e)
			return
		}
	}
	var familyAccount string
	if input.FamilyMemberID != "" {
		e = tx.QueryRow(ctx, `SELECT a.id,a.name FROM family_members f JOIN accounts a ON a.id=f.member_id
 WHERE f.id=$1 AND f.owner_id=$2 AND f.status='accepted'`, input.FamilyMemberID, uid).Scan(&familyAccount, &input.PassengerName)
		if errors.Is(e, pgx.ErrNoRows) {
			fail(w, 404, "Family member not found")
			return
		}
		if e != nil {
			dbError(w, e)
			return
		}
	}
	var id string
	e = tx.QueryRow(ctx, `INSERT INTO rides(quote_id,rider_id,request_key,payment_method,passenger_name,passenger_phone,offered_fare_paise,favorite_first_until,pickup_instructions,circle_requested,circle_captain_id,circle_until)
 SELECT q.id,q.rider_id,$3,$4,$5,$6,CASE WHEN $8::bigint<>q.fare_paise THEN $8::bigint END,CASE WHEN $7::boolean AND EXISTS(SELECT 1 FROM favorite_drivers WHERE rider_id=$2::uuid) THEN now()+interval '60 seconds' END,$9,$10,NULLIF($11,'')::uuid,CASE WHEN $10::boolean THEN now()+interval '60 seconds' END
 FROM quotes q JOIN areas a ON a.id=q.area_id WHERE q.id=$1 AND q.rider_id=$2 AND q.expires_at>now() AND a.active RETURNING id`,
		input.QuoteID, uid, input.RequestKey, input.Payment, input.PassengerName, input.PassengerPhone, input.FavoriteFirst, offerOrQuote(input.OfferPaise, quotedFare), input.PickupInstructions, input.Circle, input.CircleCaptainID).Scan(&id)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 409, "Quote expired or service area unavailable; request a fresh quote")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if input.Share {
		if _, e = tx.Exec(ctx, "UPDATE rides SET share_state='waiting',share_until=now()+$2::interval,expires_at=now()+$2::interval+interval '5 minutes' WHERE id=$1", id, shareWait); e != nil {
			dbError(w, e)
			return
		}
	}
	if promoCode != "" {
		p, qe := promoDiscount(ctx, tx, uid, promoCode, quoteArea, quotedFare, true)
		if qe != nil {
			fail(w, 409, "That promo code is no longer valid; request a fresh quote")
			return
		}
		if p.Discount != discount {
			fail(w, 409, "The promo changed; request a fresh quote")
			return
		}
		if _, e = tx.Exec(ctx, "INSERT INTO promo_redemptions(code,rider_id,ride_id,discount_paise) VALUES($1,$2,$3,$4)", p.Code, uid, id, p.Discount); e != nil {
			dbError(w, e)
			return
		}
	}
	if e = audit(ctx, tx, uid, id, "requested", map[string]any{"payment_method": input.Payment, "for_other": input.PassengerName != "", "favorite_first": input.FavoriteFirst, "offer_paise": input.OfferPaise}); e != nil {
		dbError(w, e)
		return
	}
	if familyAccount != "" {
		if e = notify(ctx, tx, familyAccount, "family_ride", "A ride was booked for you", user(r).Account.Name+" booked a ride for you."); e != nil {
			dbError(w, e)
			return
		}
	}
	// Remove supply while the transition lock is held, before new location pings can run.
	s.dropLive(ctx, uid)
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"id": id})
}
func expire(ctx context.Context, tx pgx.Tx, uid string) error {
	if _, e := tx.Exec(ctx, `WITH expired AS (UPDATE rides SET status='expired',version=version+1,updated_at=now() WHERE status='requested' AND expires_at<=now() AND ($1='' OR rider_id=NULLIF($1,'')::uuid) RETURNING id) INSERT INTO audit_events(ride_id,action) SELECT id,'expired' FROM expired`, uid); e != nil {
		return e
	}
	return releaseOrphans(ctx, tx)
}
func (s *Server) Expire(ctx context.Context) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = expire(ctx, tx, ""); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM profile_phone_challenges WHERE expires_at<now()"); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM phone_otps WHERE expires_at<now()"); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Server) action(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Action        string `json:"action"`
		Version       int    `json:"version"`
		Code          string `json:"code"`
		Reason        string `json:"reason"`
		Confirm       bool   `json:"confirm"`
		PaymentMethod string `json:"payment_method"`
	}
	if !decode(w, r, &input) {
		return
	}
	ctx := r.Context()
	uid := user(r).Account.ID
	id := r.PathValue("id")
	if input.Action != "payment_disputed" {
		s.syncDriverLocation(ctx, uid)
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if input.Action == "accept" {
		if e = lockJourney(ctx, tx, uid); e != nil {
			dbError(w, e)
			return
		}
		if riding, err := ridingNow(ctx, tx, uid); err != nil {
			dbError(w, err)
			return
		} else if riding {
			fail(w, 409, "Finish or cancel your rider trip before accepting driver requests")
			return
		}
	}
	var rider, driver, status, area, payment, category, payStatus string
	var version, attempts, pickupRadius int
	var rideFare int64
	var expires time.Time
	var pickup Point
	e = tx.QueryRow(ctx, `SELECT r.rider_id,COALESCE(r.driver_id::text,''),r.status,r.version,r.pin_attempts,r.expires_at,q.area_id,q.pickup_lat,q.pickup_lng,r.payment_method,q.vehicle_category,COALESCE(r.offered_fare_paise,q.fare_paise)+`+groupFareExtra+`,r.payment_status FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 FOR UPDATE OF r`, id).Scan(&rider, &driver, &status, &version, &attempts, &expires, &area, &pickup.Lat, &pickup.Lng, &payment, &category, &rideFare, &payStatus)
	if e != nil {
		dbError(w, e)
		return
	}
	if input.Action != "accept" && uid != rider && uid != driver {
		fail(w, 403, "This ride does not belong to you")
		return
	}
	if input.Version != version {
		fail(w, 409, "Ride changed; refresh and try again")
		return
	}
	next := ""
	event := input.Action
	switch input.Action {
	case "accept":
		if uid == rider || status != "requested" || time.Now().After(expires) {
			fail(w, 409, "Ride is no longer available")
			return
		}
		if !hasMobile(ctx, tx, uid) {
			fail(w, 403, mobileRequired)
			return
		}
		var groupID string
		var leader bool
		var shareState string
		if e = tx.QueryRow(ctx, "SELECT COALESCE(group_id::text,''),group_leader,share_state FROM rides WHERE id=$1", id).Scan(&groupID, &leader, &shareState); e != nil {
			dbError(w, e)
			return
		}
		if shareState == "waiting" || (groupID != "" && !leader) {
			fail(w, 409, "Ride is no longer available")
			return
		}
		var at Point
		var has bool
		e = tx.QueryRow(ctx, `SELECT d.lat,d.lng,d.pickup_radius_meters,(d.status='approved' AND d.online AND d.area_id=$2 AND d.vehicle_category=$4 AND d.minimum_fare_paise<=$5 AND a.active AND d.location_at>now()-interval '60 seconds' AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND ($3<>'upi' OR d.upi_id<>'')) FROM drivers d JOIN areas a ON a.id=d.area_id WHERE d.user_id=$1 FOR UPDATE OF d`, uid, area, payment, category, rideFare).Scan(&at.Lat, &at.Lng, &pickupRadius, &has)
		if e != nil || !has || distance(at, pickup) > float64(pickupRadius) {
			fail(w, 403, "An approved, nearby driver with fresh location is required")
			return
		}
		if s.Config.Features.HopCircle {
			var eligible bool
			e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides r WHERE r.id=$1"+s.circleEligibility("$2::uuid")+")", id, uid).Scan(&eligible)
			if e != nil {
				dbError(w, e)
				return
			}
			if !eligible {
				fail(w, 409, "This Circle invitation is no longer available")
				return
			}
		}
		var reserved bool
		e = tx.QueryRow(ctx, `SELECT COALESCE(favorite_first_until>now() AND NOT EXISTS(SELECT 1 FROM favorite_drivers WHERE rider_id=rides.rider_id AND driver_id=$2),false)
 OR COALESCE(reserved_until>now() AND reserved_driver_id IS DISTINCT FROM $2::uuid,false) FROM rides WHERE id=$1`, id, uid).Scan(&reserved)
		if e == nil && reserved {
			fail(w, 409, "This ride is briefly reserved for the rider's chosen driver")
			return
		}
		if e != nil {
			dbError(w, e)
			return
		}
		var offered bool
		if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM ride_offers WHERE ride_id=$1 AND driver_id=$2) OR EXISTS(SELECT 1 FROM rides WHERE id=$1 AND reserved_driver_id=$2)", id, uid).Scan(&offered); e != nil {
			dbError(w, e)
			return
		}
		if !offered {
			fail(w, 409, "This request has not been offered to you yet")
			return
		}
		var busy bool
		e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress'))", uid).Scan(&busy)
		if e != nil {
			dbError(w, e)
			return
		}
		if busy {
			fail(w, 409, "Finish your active ride first")
			return
		}
		driver = uid
		next = "accepted"
		if groupID != "" {
			if e = s.acceptGroup(ctx, tx, id, uid, at); e != nil {
				fail(w, 409, "Ride is no longer available")
				return
			}
		}
	case "arrive":
		if uid == driver && status == "accepted" {
			next = "arrived"
		}
	case "start":
		if uid != driver || status != "arrived" {
			break
		}
		if attempts >= 5 {
			fail(w, 429, "Pickup code locked after five attempts; cancel and contact support")
			return
		}
		if !hmac.Equal([]byte(input.Code), []byte(s.pin(id))) {
			_, e = tx.Exec(ctx, "UPDATE rides SET pin_attempts=pin_attempts+1 WHERE id=$1", id)
			if e == nil {
				e = audit(ctx, tx, uid, id, "pickup_code_rejected", map[string]int{"attempt": attempts + 1})
			}
			if e == nil {
				e = tx.Commit(ctx)
			}
			if e != nil {
				dbError(w, e)
				return
			}
			fail(w, 400, "Incorrect pickup code")
			return
		}
		var wait int64
		if e = tx.QueryRow(ctx, waitChargeSQL, id).Scan(&wait); e == nil && wait > 0 {
			_, e = tx.Exec(ctx, "UPDATE rides SET wait_charge_paise=$2,offered_fare_paise=COALESCE(offered_fare_paise,(SELECT fare_paise FROM quotes WHERE id=quote_id))+$2 WHERE id=$1", id, wait)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		next = "in_progress"
	case "complete":
		if uid == driver && status == "in_progress" {
			next = "completed"
			adjusted, covered, remaining, early, e := earlyFinishQuote(ctx, tx, id, uid)
			if e != nil {
				dbError(w, e)
				return
			}
			if early && !input.Confirm {
				fail(w, 409, fmt.Sprintf("Early finish: you are about %.1f km from the destination. The fare becomes ₹%d for the distance covered unless the rider approves the full fare.", remaining/1000, adjusted/100))
				return
			}
			if early {
				if _, e = tx.Exec(ctx, "UPDATE rides SET adjusted_from_paise=COALESCE(offered_fare_paise,(SELECT fare_paise FROM quotes WHERE id=quote_id)),offered_fare_paise=$2,covered_meters=$3 WHERE id=$1", id, adjusted, covered); e != nil {
					dbError(w, e)
					return
				}
			}
		}
	case "request_full_fare":
		if uid != driver || status != "in_progress" {
			break
		}
		tag, err := tx.Exec(ctx, "UPDATE rides SET full_fare_status='requested',version=version+1,updated_at=now() WHERE id=$1 AND full_fare_status IN ('none','declined')", id)
		if err != nil {
			dbError(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 409, "Full fare was already requested")
			return
		}
		e = notify(ctx, tx, rider, "ride", "Driver asks for the full fare", "Your driver would like the full quoted fare although the trip may end before the destination. Approve or decline in the app.")
		if e == nil {
			e = audit(ctx, tx, uid, id, event, map[string]string{})
		}
		if e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	case "approve_full_fare", "decline_full_fare":
		if uid != rider || status != "in_progress" {
			break
		}
		result := "approved"
		if input.Action == "decline_full_fare" {
			result = "declined"
		}
		tag, err := tx.Exec(ctx, "UPDATE rides SET full_fare_status=$2,version=version+1,updated_at=now() WHERE id=$1 AND full_fare_status='requested'", id, result)
		if err != nil {
			dbError(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 409, "There is no full-fare request to answer")
			return
		}
		e = audit(ctx, tx, uid, id, event, map[string]string{})
		if e == nil && driver != "" {
			e = notify(ctx, tx, driver, "ride", "Rider answered your full-fare request", "The rider "+result+" the full fare.")
		}
		if e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	case "stop_waiting", "pay_full_fare":
		if uid != rider {
			break
		}
		done, err := s.shareAction(ctx, tx, input.Action, id)
		if err != nil {
			dbError(w, err)
			return
		}
		if !done {
			fail(w, 409, "This ride is not waiting for a shared match")
			return
		}
		if e = audit(ctx, tx, uid, id, event, map[string]string{}); e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	case "cancel":
		if (uid == rider || uid == driver) && (status == "requested" || status == "accepted" || status == "arrived") {
			if len(strings.TrimSpace(input.Reason)) < 3 || len(input.Reason) > 300 {
				fail(w, 400, "Provide a cancellation reason (3–300 characters)")
				return
			}
			next = "cancelled"
		}
	case "payment_received", "payment_disputed":
		if status != "completed" || (input.Action == "payment_received" && uid != driver) || (input.Action == "payment_disputed" && uid != rider) {
			break
		}
		reported := "driver_reported_received"
		if input.Action == "payment_disputed" {
			reported = "rider_disputed"
		}
		tag, err := tx.Exec(ctx, "UPDATE rides SET payment_status=$2,version=version+1,updated_at=now() WHERE id=$1 AND payment_status NOT IN ('rider_disputed','paid_online')", id, reported)
		if err != nil {
			dbError(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 409, "Payment is disputed; operator review required")
			return
		}
		if input.Action == "payment_received" {
			e = creditPromoSubsidy(ctx, tx, id)
		}
		if e == nil {
			e = audit(ctx, tx, uid, id, event, map[string]string{})
		}
		if e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	case "change_payment_method":
		if uid != rider || (status != "requested" && status != "accepted" && status != "arrived" && status != "in_progress" && status != "completed") {
			break
		}
		newMethod := strings.ToLower(strings.TrimSpace(input.PaymentMethod))
		if newMethod != "cash" && newMethod != "upi" && newMethod != "wallet" {
			fail(w, 400, "Invalid payment method")
			return
		}
		if status == "completed" && payStatus != "unconfirmed" {
			fail(w, 409, "Payment for this ride is already settled or under review")
			return
		}
		if driver != "" && newMethod == "upi" {
			var driverUpi string
			_ = tx.QueryRow(ctx, "SELECT COALESCE(upi_id,'') FROM drivers WHERE user_id=$1", driver).Scan(&driverUpi)
			if driverUpi == "" {
				fail(w, 400, "Driver has no UPI ID registered. Please use Cash or Wallet.")
				return
			}
		}
		tag, err := tx.Exec(ctx, "UPDATE rides SET payment_method=$2,version=version+1,updated_at=now() WHERE id=$1", id, newMethod)
		if err != nil {
			dbError(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 404, "Ride not found")
			return
		}
		e = audit(ctx, tx, uid, id, "change_payment_method", map[string]string{"from": payment, "to": newMethod})
		if e == nil && driver != "" {
			e = notify(ctx, tx, driver, "payment", "Payment method updated", "Rider switched payment method to "+strings.ToUpper(newMethod))
		}
		if e == nil && status == "completed" && newMethod == "wallet" {
			e = settleWalletRide(ctx, tx, id, rider)
		}
		if e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]any{"ok": true, "payment_method": newMethod})
		return
	case "notify_driver_paid":
		if uid != rider || status != "completed" {
			break
		}
		if driver != "" {
			e = notify(ctx, tx, driver, "payment", "Payment sent by rider", "Rider reported sending payment. Please verify and confirm.")
		}
		if e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	}
	if next == "" {
		fail(w, 409, "This transition is not allowed")
		return
	}
	_, e = tx.Exec(ctx, `UPDATE rides SET status=$2,driver_id=NULLIF($3,'')::uuid,cancel_reason=$4,
 completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END,
 version=version+1,updated_at=now() WHERE id=$1`, id, next, driver, input.Reason)
	if e == nil && next == "cancelled" {
		e = releaseOrphans(ctx, tx)
	}
	if e == nil && next == "completed" && payment == "wallet" {
		e = settleWalletRide(ctx, tx, id, rider)
	}
	if e == nil && next == "completed" {
		e = ensureTripStatement(ctx, tx, id)
	}
	if e == nil {
		e = audit(ctx, tx, uid, id, next, map[string]string{"reason": input.Reason})
	}
	if e == nil {
		e = notifyRideStatus(ctx, tx, id, next, uid, rider, driver)
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

// notifyRideStatus tells the other party about a status change so neither side has to watch the screen.
func notifyRideStatus(ctx context.Context, tx pgx.Tx, rideID, next, actor, rider, driver string) error {
	title, body, to := "", "", rider
	switch next {
	case "accepted":
		title, body = "Driver confirmed", "Your driver accepted the ride and is on the way."
	case "arrived":
		title, body = "Driver arrived", "Your driver is at the pickup point. Share your pickup code."
	case "in_progress":
		title, body = "Trip started", "Your trip has started. Share it with family from Safety."
	case "completed":
		title, body = "Trip completed", "Thanks for riding with hop. Find your receipt in My trips and rate your driver."
		var payable int64
		var method, paid string
		if e := tx.QueryRow(ctx, `SELECT GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise),r.payment_method,r.payment_status FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1`, rideID).Scan(&payable, &method, &paid); e == nil {
			amount := fmt.Sprintf("₹%.2f", float64(payable)/100)
			switch {
			case paid == "paid_online":
				title, body = "Trip completed · "+amount+" paid", amount+" was paid from your hop wallet. Your receipt is in My trips. Please rate your driver."
			case method == "upi":
				title, body = "Trip completed · pay "+amount, "Please pay "+amount+" to your driver by UPI. Your receipt is in My trips."
			default:
				title, body = "Trip completed · pay "+amount, "Please pay "+amount+" in cash to your driver. Your receipt is in My trips."
			}
		}
	case "cancelled":
		title, body = "Ride cancelled", "The ride was cancelled."
		if actor == rider {
			to = driver
		}
	default:
		return nil
	}
	if to == "" || to == actor {
		return nil
	}
	return notify(ctx, tx, to, "ride", title, body)
}

func fareWithinBounds(amount, quoted int64) bool {
	return amount*100 >= quoted*70 && amount*100 <= quoted*150
}
func offerOrQuote(offer *int64, quoted int64) int64 {
	if offer == nil {
		return quoted
	}
	return *offer
}

// bid lets an eligible nearby driver counter-offer a fare on a requested ride.
func (s *Server) bid(w http.ResponseWriter, r *http.Request) {
	var in struct {
		AmountPaise int64 `json:"amount_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx, uid, rideID := r.Context(), user(r).Account.ID, r.PathValue("id")
	if !s.limit(w, r, "bid:"+uid, 20, 60) {
		return
	}
	var quoted int64
	var shareState string
	if e := s.DB.QueryRow(ctx, "SELECT q.fare_paise,r.share_state FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1", rideID).Scan(&quoted, &shareState); e != nil {
		dbError(w, e)
		return
	}
	if shareState != "none" && shareState != "solo_full" {
		fail(w, 409, "Shared rides have a fixed shared fare and take no counter-offers")
		return
	}
	if !fareWithinBounds(in.AmountPaise, quoted) {
		fail(w, 400, "Counter-offers must be between 70% and 150% of the quoted fare")
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var eligible bool
	e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1"+s.circleOfferFrom()+" AND r.id=$2::uuid AND $3::bigint>=d.minimum_fare_paise)", uid, rideID, in.AmountPaise).Scan(&eligible)
	if e != nil {
		dbError(w, e)
		return
	}
	if !eligible {
		fail(w, 403, "This ride is not available for your counter-offer")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO ride_bids(ride_id,driver_id,amount_paise) VALUES($1,$2,$3)
 ON CONFLICT(ride_id,driver_id) DO UPDATE SET amount_paise=EXCLUDED.amount_paise,created_at=now()`, rideID, uid, in.AmountPaise)
	if e == nil {
		e = audit(ctx, tx, uid, rideID, "fare_counter_offer", map[string]int64{"amount_paise": in.AmountPaise})
	}
	if e == nil {
		e = notify(ctx, tx, rideRider(ctx, tx, rideID), "bid", "New fare offer", "A driver offered a fare for your ride.")
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]bool{"ok": true})
}

func rideRider(ctx context.Context, tx pgx.Tx, rideID string) string {
	var id string
	_ = tx.QueryRow(ctx, "SELECT rider_id FROM rides WHERE id=$1", rideID).Scan(&id)
	return id
}

// acceptBid fixes the fare at the chosen driver's counter-offer and reserves the ride for that driver for 60 seconds.
func (s *Server) acceptBid(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var driver string
	var amount int64
	e = tx.QueryRow(ctx, `SELECT b.driver_id,b.amount_paise FROM ride_bids b JOIN rides r ON r.id=b.ride_id
 WHERE b.id=$1 AND r.id=$2 AND r.rider_id=$3 AND r.status='requested' AND r.expires_at>now() FOR UPDATE OF r`, r.PathValue("bid"), r.PathValue("id"), uid).Scan(&driver, &amount)
	if e != nil {
		dbError(w, e)
		return
	}
	if s.Config.Features.HopCircle {
		var captain string
		if e = tx.QueryRow(ctx, "SELECT user_id FROM drivers WHERE user_id=$1 FOR UPDATE", driver).Scan(&captain); e != nil {
			dbError(w, e)
			return
		}
		var eligible bool
		e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides r WHERE r.id=$1"+s.circleEligibility("$2::uuid")+")", r.PathValue("id"), driver).Scan(&eligible)
		if e != nil {
			dbError(w, e)
			return
		}
		if !eligible {
			fail(w, 409, "This Circle fare offer is no longer eligible")
			return
		}
	}
	_, e = tx.Exec(ctx, "UPDATE rides SET offered_fare_paise=$2,reserved_driver_id=$3,reserved_until=now()+interval '60 seconds',version=version+1,updated_at=now() WHERE id=$1", r.PathValue("id"), amount, driver)
	if e == nil {
		e = audit(ctx, tx, uid, r.PathValue("id"), "fare_counter_accepted", map[string]int64{"amount_paise": amount})
	}
	if e == nil {
		e = notify(ctx, tx, driver, "bid", "Your fare offer was chosen", "Open the ride and accept within 60 seconds.")
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

// earlyFinishQuote prices a city trip by the distance actually covered when the driver ends it well short of the
// destination, unless the rider approved the full fare. early=false means the full fare stands.
func earlyFinishQuote(ctx context.Context, tx pgx.Tx, rideID, driverID string) (adjusted, covered int64, remaining float64, early bool, e error) {
	var tripType, fullStatus string
	var total, fare, baseFare, minFare int64
	var pickup, drop, at Point
	var located bool
	e = tx.QueryRow(ctx, `SELECT q.trip_type,r.full_fare_status,q.meters,COALESCE(r.offered_fare_paise,q.fare_paise),
 q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng,q.base_paise,q.minimum_paise,
 COALESCE(d.lat,0),COALESCE(d.lng,0),COALESCE(d.location_at>now()-interval '15 minutes',false)
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN drivers d ON d.user_id=$2 WHERE r.id=$1`, rideID, driverID).Scan(&tripType, &fullStatus, &total, &fare, &pickup.Lat, &pickup.Lng, &drop.Lat, &drop.Lng, &baseFare, &minFare, &at.Lat, &at.Lng, &located)
	if e != nil {
		return
	}
	remaining = distance(at, drop)
	if tripType != "city" || fullStatus == "approved" || !located || total <= 0 || remaining <= earlyFinishMeters {
		return
	}
	fromPickup := distance(pickup, at)
	toDrop := remaining

	if fromPickup < 250 {
		// Driver has not moved significantly from pickup point: 0 distance covered
		covered = 0
		adjusted = baseFare
		if adjusted <= 0 {
			adjusted = minFare
		}
		if adjusted > fare {
			adjusted = fare
		}
		remaining = float64(total)
	} else {
		// Pro-rate distance and fare along the actual pickup-to-dropoff trajectory
		fraction := fromPickup / (fromPickup + toDrop)
		if fraction > 1.0 {
			fraction = 1.0
		}
		covered = int64(float64(total) * fraction)
		if covered > total {
			covered = total
		}
		adjusted = baseFare + int64(float64(fare-baseFare)*fraction)
		if adjusted < minFare {
			adjusted = minFare
		}
		if adjusted > fare {
			adjusted = fare
		}
		remaining = float64(total - covered)
	}
	adjusted = (adjusted + 50) / 100 * 100
	early = adjusted < fare
	return
}

// earlyFinishMeters is how far from the destination a trip may end before the fare is adjusted.
const earlyFinishMeters = 300

// decline hides a requested ride from this driver only; dispatch then skips them and also drops any counter-offer they made.
func (s *Server) decline(w http.ResponseWriter, r *http.Request) {
	ctx, uid, rideID := r.Context(), user(r).Account.ID, r.PathValue("id")
	if !s.limit(w, r, "decline:"+uid, 60, 60) {
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var ok bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1"+s.circleOfferFrom()+" AND r.id=$2::uuid)", uid, rideID).Scan(&ok); e != nil {
		dbError(w, e)
		return
	}
	if !ok {
		fail(w, 404, "This ride is not available to you")
		return
	}
	if _, e = tx.Exec(ctx, "INSERT INTO ride_declines(ride_id,driver_id) VALUES($1,$2) ON CONFLICT DO NOTHING", rideID, uid); e == nil {
		_, e = tx.Exec(ctx, "DELETE FROM ride_bids WHERE ride_id=$1 AND driver_id=$2", rideID, uid)
	}
	if e == nil {
		_, e = tx.Exec(ctx, "UPDATE ride_offers SET outcome='declined' WHERE ride_id=$1 AND driver_id=$2 AND outcome IS NULL", rideID, uid)
		if e == nil {
			e = audit(ctx, tx, uid, rideID, "driver_declined", nil)
		}
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
