package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Captain monthly pass. Captains pay a flat price per period instead of a per-ride commission.
// A zone needs a pass only when an operator sets areas.pass_required; then a captain without a
// current pass can't go online, see offers, accept rides or be matched.

// passOK is true when captain d may work in zone a: the zone doesn't need a pass, or one covers now.
const passOK = `(NOT a.pass_required OR EXISTS(SELECT 1 FROM captain_passes cp WHERE cp.driver_id=d.user_id AND cp.starts_at<=now() AND cp.ends_at>now()))`

// passRenewDays: a captain can buy the next period once the current one has this many days left
// (or fewer). It stops a double tap from buying two months.
const passRenewDays = 7

const passRequiredMessage = "A monthly pass is needed to drive in this zone. Buy one from Earnings, or ask Hop support."

func (s *Server) driverPass(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	var category string
	var required bool
	var price int64
	var days int
	e := s.DB.QueryRow(ctx, `SELECT d.vehicle_category,COALESCE(a.pass_required,false),p.price_paise,p.days
 FROM drivers d LEFT JOIN areas a ON a.id=d.area_id JOIN captain_pass_prices p ON p.category=d.vehicle_category WHERE d.user_id=$1`, uid).Scan(&category, &required, &price, &days)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 403, "Driver account required")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	var balance int64
	var paidUntil *time.Time
	if e = s.DB.QueryRow(ctx, `SELECT COALESCE((SELECT sum(amount_paise) FROM driver_ledger WHERE driver_id=$1),0),
 (SELECT max(ends_at) FROM captain_passes WHERE driver_id=$1 AND ends_at>now())`, uid).Scan(&balance, &paidUntil); e != nil {
		dbError(w, e)
		return
	}
	var active json.RawMessage
	if e = s.DB.QueryRow(ctx, `SELECT COALESCE((SELECT row_to_json(t) FROM (SELECT id,starts_at,ends_at,source FROM captain_passes
 WHERE driver_id=$1 AND starts_at<=now() AND ends_at>now() ORDER BY ends_at DESC LIMIT 1) t),'null'::json)`, uid).Scan(&active); e != nil {
		dbError(w, e)
		return
	}
	history, e := jsonRows(ctx, s.DB, `SELECT id,category,starts_at,ends_at,source,price_paise,note,created_at FROM captain_passes WHERE driver_id=$1 ORDER BY created_at DESC LIMIT 12`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	renewFrom := time.Now()
	if paidUntil != nil {
		renewFrom = paidUntil.Add(-passRenewDays * 24 * time.Hour)
	}
	canBuy := !time.Now().Before(renewFrom)
	write(w, 200, map[string]any{"required": required, "active": active, "paid_until": paidUntil, "category": category,
		"price_paise": price, "days": days, "balance_paise": balance, "can_buy": canBuy, "renew_from": renewFrom,
		"renew_days": passRenewDays, "history": history})
}

// buyPass pays for the next period from the captain's earnings balance. The client sends the price it
// showed, so a price change between viewing and paying is refused rather than charged.
func (s *Server) buyPass(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	if !s.limit(w, r, "pass:"+uid, 5, 60) {
		return
	}
	var in struct {
		PricePaise int64 `json:"price_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var category, status string
	var price int64
	var days int
	e = tx.QueryRow(ctx, `SELECT d.vehicle_category,d.status,p.price_paise,p.days FROM drivers d JOIN captain_pass_prices p ON p.category=d.vehicle_category
 WHERE d.user_id=$1 FOR UPDATE OF d`, uid).Scan(&category, &status, &price, &days)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 403, "Driver account required")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if status != "approved" {
		fail(w, 409, "Your Captain account must be approved before buying a pass")
		return
	}
	if in.PricePaise != price {
		fail(w, 409, "The pass price has changed to ₹"+rupees(price)+". Check it and try again.")
		return
	}
	start, e := passStart(ctx, tx, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	if start.After(time.Now().Add(passRenewDays * 24 * time.Hour)) {
		fail(w, 409, "Your pass already runs until "+istDate(start)+". You can renew in its last 7 days.")
		return
	}
	var balance int64
	if e = tx.QueryRow(ctx, "SELECT COALESCE(sum(amount_paise),0) FROM driver_ledger WHERE driver_id=$1", uid).Scan(&balance); e != nil {
		dbError(w, e)
		return
	}
	if balance < price {
		fail(w, 409, "Your Hop balance is ₹"+rupees(balance)+" and the pass costs ₹"+rupees(price)+". Ask Hop support to add a pass you pay for in cash.")
		return
	}
	end := start.Add(time.Duration(days) * 24 * time.Hour)
	var id string
	if e = tx.QueryRow(ctx, `INSERT INTO captain_passes(driver_id,category,starts_at,ends_at,source,price_paise,created_by)
 VALUES($1,$2,$3,$4,'earnings',$5,$1) RETURNING id`, uid, category, start, end, price).Scan(&id); e != nil {
		dbError(w, e)
		return
	}
	if price > 0 {
		if _, e = tx.Exec(ctx, "INSERT INTO driver_ledger(driver_id,kind,amount_paise,note) VALUES($1,'pass',$2,$3)", uid, -price, "Monthly pass "+id[:8]+" until "+istDate(end)); e != nil {
			dbError(w, e)
			return
		}
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"id": id, "starts_at": start, "ends_at": end, "price_paise": price})
}

// passStart is when a new period begins: now, or when the captain's last period ends.
func passStart(ctx context.Context, tx pgx.Tx, driver string) (time.Time, error) {
	var start time.Time
	e := tx.QueryRow(ctx, "SELECT GREATEST(now(),COALESCE(max(ends_at),now())) FROM captain_passes WHERE driver_id=$1", driver).Scan(&start)
	return start, e
}

func istDate(t time.Time) string {
	if loc, e := time.LoadLocation("Asia/Kolkata"); e == nil {
		t = t.In(loc)
	}
	return t.Format("2 Jan 2006")
}

// ---- Operator ---------------------------------------------------------------------------------------

func (s *Server) operatorPasses(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	prices, e := jsonRows(ctx, s.DB, "SELECT category,price_paise,days,updated_at FROM captain_pass_prices ORDER BY array_position(ARRAY['bike','auto','mini','sedan','suv'],category)")
	if e != nil {
		dbError(w, e)
		return
	}
	areas, e := jsonRows(ctx, s.DB, `SELECT a.id,a.name,a.active,a.pass_required,
 (SELECT count(*) FROM drivers d WHERE d.area_id=a.id AND d.status='approved')::int AS captains,
 (SELECT count(*) FROM drivers d WHERE d.area_id=a.id AND d.status='approved' AND EXISTS(SELECT 1 FROM captain_passes cp WHERE cp.driver_id=d.user_id AND cp.starts_at<=now() AND cp.ends_at>now()))::int AS with_pass
 FROM areas a ORDER BY a.active DESC,a.name`)
	if e != nil {
		dbError(w, e)
		return
	}
	passes, e := jsonRows(ctx, s.DB, `SELECT p.id,p.driver_id,ac.name AS captain_name,d.vehicle_number,p.category,p.starts_at,p.ends_at,p.source,p.price_paise,p.note,p.created_at,
 (p.starts_at<=now() AND p.ends_at>now()) AS current
 FROM captain_passes p JOIN drivers d ON d.user_id=p.driver_id JOIN accounts ac ON ac.id=p.driver_id ORDER BY p.created_at DESC LIMIT 100`)
	if e != nil {
		dbError(w, e)
		return
	}
	captains, e := jsonRows(ctx, s.DB, `SELECT d.user_id AS id,ac.name,d.vehicle_number,d.vehicle_category AS category,a.name AS area,
 (SELECT max(ends_at) FROM captain_passes cp WHERE cp.driver_id=d.user_id AND cp.ends_at>now()) AS paid_until
 FROM drivers d JOIN accounts ac ON ac.id=d.user_id LEFT JOIN areas a ON a.id=d.area_id WHERE d.status='approved' ORDER BY ac.name LIMIT 500`)
	if e != nil {
		dbError(w, e)
		return
	}
	var month, active int64
	if e = s.DB.QueryRow(ctx, `SELECT COALESCE((SELECT sum(price_paise) FROM captain_passes WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),0),
 (SELECT count(DISTINCT driver_id) FROM captain_passes WHERE starts_at<=now() AND ends_at>now())`).Scan(&month, &active); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"prices": prices, "areas": areas, "passes": passes, "captains": captains, "revenue_month_paise": month, "active_passes": active, "renew_days": passRenewDays})
}

func (s *Server) operatorSavePassPrice(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Category   string `json:"category"`
		PricePaise int64  `json:"price_paise"`
		Days       int    `json:"days"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.PricePaise < 0 || in.PricePaise > 10000000 || in.Days < 1 || in.Days > 90 {
		fail(w, 400, "Price must be ₹0–₹1,00,000 and the period 1–90 days")
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	tag, e := tx.Exec(ctx, "UPDATE captain_pass_prices SET price_paise=$2,days=$3,updated_at=now(),updated_by=$4 WHERE category=$1", in.Category, in.PricePaise, in.Days, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 400, "Unknown vehicle type")
		return
	}
	if e = audit(ctx, tx, uid, "", "pass_price", in); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) operatorAreaPass(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Required bool `json:"required"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx, uid, id := r.Context(), user(r).Account.ID, r.PathValue("id")
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	tag, e := tx.Exec(ctx, "UPDATE areas SET pass_required=$2 WHERE id=$1", id, in.Required)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Zone not found")
		return
	}
	if e = audit(ctx, tx, uid, "", "zone_pass_required", map[string]any{"area": id, "required": in.Required}); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// operatorGrantPass adds a period to a captain's pass, for example after collecting cash at the office
// or as a free trial. It doesn't touch the captain's Hop balance.
func (s *Server) operatorGrantPass(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Days           int    `json:"days"`
		CollectedPaise int64  `json:"collected_paise"`
		Note           string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Note = strings.TrimSpace(in.Note)
	if in.Days < 1 || in.Days > 90 || in.CollectedPaise < 0 || in.CollectedPaise > 10000000 || len(in.Note) < 3 || len(in.Note) > 300 {
		fail(w, 400, "Give 1–90 days, the amount collected (₹0 for free) and a note of at least 3 characters")
		return
	}
	ctx, uid, driver := r.Context(), user(r).Account.ID, r.PathValue("id")
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var category string
	if e = tx.QueryRow(ctx, "SELECT vehicle_category FROM drivers WHERE user_id=$1 FOR UPDATE", driver).Scan(&category); e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			fail(w, 404, "Captain not found")
			return
		}
		dbError(w, e)
		return
	}
	start, e := passStart(ctx, tx, driver)
	if e != nil {
		dbError(w, e)
		return
	}
	end := start.Add(time.Duration(in.Days) * 24 * time.Hour)
	var id string
	if e = tx.QueryRow(ctx, `INSERT INTO captain_passes(driver_id,category,starts_at,ends_at,source,price_paise,note,created_by)
 VALUES($1,$2,$3,$4,'operator',$5,$6,$7) RETURNING id`, driver, category, start, end, in.CollectedPaise, in.Note, uid).Scan(&id); e != nil {
		dbError(w, e)
		return
	}
	if e = audit(ctx, tx, uid, "", "pass_grant", map[string]any{"pass": id, "driver": driver, "days": in.Days, "collected_paise": in.CollectedPaise}); e != nil {
		dbError(w, e)
		return
	}
	if e = notify(ctx, tx, driver, "pass", "Monthly pass added", "Hop added a pass that runs until "+istDate(end)+"."); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"id": id, "starts_at": start, "ends_at": end})
}
