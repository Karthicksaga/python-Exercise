package app

import (
	"context"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var (
	genders       = map[string]bool{"": true, "female": true, "male": true, "other": true, "undisclosed": true}
	avatarColors  = map[string]bool{"indigo": true, "emerald": true, "rose": true, "amber": true, "sky": true, "slate": true}
	payDefaults   = map[string]bool{"cash": true, "upi": true, "wallet": true}
	vehicleChoice = map[string]bool{"": true, "bike": true, "auto": true, "mini": true, "sedan": true, "suv": true}
)

var gstinPattern = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)

const maxEmergencyContacts = 5

func (s *Server) profileState(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	var out struct {
		Details  any `json:"details"`
		Stats    any `json:"stats"`
		Contacts any `json:"contacts"`
	}
	var e error
	if out.Details, e = jsonRows(ctx, s.DB, `SELECT a.id,a.name,a.email,a.issuer='phone' AS phone_login,a.created_at,
 COALESCE(NULLIF(p.phone,''),CASE WHEN a.issuer='phone' THEN a.subject ELSE '' END) AS phone,
 EXISTS(SELECT 1 FROM verified_phones v WHERE v.account_id=a.id AND v.phone=COALESCE(NULLIF(p.phone,''),CASE WHEN a.issuer='phone' THEN a.subject ELSE '' END)) AS phone_verified,
 EXISTS(SELECT 1 FROM profile_photos f WHERE f.account_id=a.id) AS has_photo,
 COALESCE((SELECT approved FROM profile_photos f WHERE f.account_id=a.id),false) AS photo_approved,COALESCE(p.gender,'') AS gender,
 to_char(p.birth_date,'YYYY-MM-DD') AS birth_date,COALESCE(p.avatar_color,'indigo') AS avatar_color,
 COALESCE(p.default_payment,'cash') AS default_payment,COALESCE(p.default_vehicle,'') AS default_vehicle,p.deletion_requested_at,COALESCE(p.company_name,'') AS company_name,COALESCE(p.business_gstin,'') AS business_gstin,COALESCE(p.cost_centre,'') AS cost_centre,COALESCE(p.work_email,'') AS work_email
 FROM accounts a LEFT JOIN account_profiles p ON p.account_id=a.id WHERE a.id=$1`, uid); e != nil {
		dbError(w, e)
		return
	}
	if out.Stats, e = jsonRows(ctx, s.DB, `SELECT
 (SELECT count(*) FROM rides WHERE rider_id=$1 AND status='completed') AS rides_taken,
 (SELECT count(*) FROM rides WHERE rider_id=$1 AND status='cancelled') AS rides_cancelled,
 (SELECT COALESCE(sum(GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise)),0) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.rider_id=$1 AND r.status='completed') AS spent_paise,
 (SELECT COALESCE(sum(q.meters),0) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.rider_id=$1 AND r.status='completed') AS meters,
 (SELECT round(avg(score)::numeric,2)::float8 FROM ride_ratings WHERE rated_id=$1) AS rating_avg,
 (SELECT count(*) FROM ride_ratings WHERE rated_id=$1) AS rating_count,
 (SELECT COALESCE(sum(amount_paise),0) FROM wallet_entries WHERE account_id=$1) AS wallet_paise,
 (SELECT COALESCE(sum(points),0) FROM reward_ledger WHERE account_id=$1) AS reward_points,
 (SELECT count(*) FROM rides WHERE driver_id=$1 AND status='completed') AS drives_completed,
 (SELECT count(*) FROM saved_locations WHERE account_id=$1) AS saved_places`, uid); e != nil {
		dbError(w, e)
		return
	}
	if out.Contacts, e = jsonRows(ctx, s.DB, "SELECT id,name,phone,relation FROM emergency_contacts WHERE account_id=$1 ORDER BY created_at", uid); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, out)
}

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name           string  `json:"name"`
		CompanyName    *string `json:"company_name"`
		BusinessGSTIN  *string `json:"business_gstin"`
		CostCentre     *string `json:"cost_centre"`
		WorkEmail      *string `json:"work_email"`
		Phone          *string `json:"phone"`
		Gender         *string `json:"gender"`
		BirthDate      *string `json:"birth_date"`
		AvatarColor    *string `json:"avatar_color"`
		DefaultPayment *string `json:"default_payment"`
		DefaultVehicle *string `json:"default_vehicle"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if utf8.RuneCountInString(in.Name) < 2 || utf8.RuneCountInString(in.Name) > 80 {
		fail(w, 400, "Name must be between 2 and 80 characters")
		return
	}
	for _, char := range in.Name {
		if unicode.IsControl(char) {
			fail(w, 400, "Name cannot contain control characters")
			return
		}
	}
	if in.Phone != nil && !(*in.Phone == "" || validPhone(*in.Phone)) {
		fail(w, 400, "Enter a 10-digit Indian mobile number")
		return
	}
	if in.Gender != nil && !genders[*in.Gender] {
		fail(w, 400, "Unsupported gender option")
		return
	}
	if in.AvatarColor != nil && !avatarColors[*in.AvatarColor] {
		fail(w, 400, "Unsupported avatar colour")
		return
	}
	if in.DefaultPayment != nil && !payDefaults[*in.DefaultPayment] {
		fail(w, 400, "Unsupported payment method")
		return
	}
	if in.DefaultVehicle != nil && !vehicleChoice[*in.DefaultVehicle] {
		fail(w, 400, "Unsupported vehicle")
		return
	}
	var birth *time.Time
	clearBirth := false
	if in.BirthDate != nil {
		if *in.BirthDate == "" {
			clearBirth = true
		} else {
			d, err := time.Parse("2006-01-02", *in.BirthDate)
			if err != nil || d.After(time.Now().AddDate(-16, 0, 0)) || d.Year() < 1900 {
				fail(w, 400, "You must be at least 16 years old to use Hop")
				return
			}
			birth = &d
		}
	}
	for _, field := range []*string{in.CompanyName, in.CostCentre, in.WorkEmail, in.BusinessGSTIN} {
		if field != nil {
			v := strings.TrimSpace(*field)
			*field = v
			if len(v) > 160 || strings.IndexFunc(v, unicode.IsControl) >= 0 {
				fail(w, 400, "Business fields must be at most 160 characters without control characters")
				return
			}
		}
	}
	if in.BusinessGSTIN != nil && *in.BusinessGSTIN != "" {
		v := strings.ToUpper(*in.BusinessGSTIN)
		in.BusinessGSTIN = &v
		if !gstinPattern.MatchString(v) {
			fail(w, 400, "Enter a valid 15-character GSTIN or leave it blank")
			return
		}
	}
	if in.WorkEmail != nil && *in.WorkEmail != "" {
		address, err := mail.ParseAddress(*in.WorkEmail)
		if err != nil || address.Address != *in.WorkEmail {
			fail(w, 400, "Enter a valid work email")
			return
		}
	}
	uid, ctx := user(r).Account.ID, r.Context()
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
	var oldName string
	if e = tx.QueryRow(ctx, "SELECT name FROM accounts WHERE id=$1 FOR UPDATE", uid).Scan(&oldName); e != nil {
		dbError(w, e)
		return
	}
	if oldName != in.Name {
		var active bool
		if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress'))", uid).Scan(&active); e != nil {
			dbError(w, e)
			return
		}
		if active {
			fail(w, 409, "Finish your captain trip before changing your name")
			return
		}
		if _, e = tx.Exec(ctx, "UPDATE drivers SET status='pending',online=false,pink_certified=false,review_note='Name changed. Awaiting identity review.',updated_at=now() WHERE user_id=$1 AND status='approved'", uid); e != nil {
			dbError(w, e)
			return
		}
		if _, e = tx.Exec(ctx, "UPDATE driver_verifications SET identity_ok=false WHERE driver_id=$1", uid); e != nil {
			dbError(w, e)
			return
		}
	}
	if _, e = tx.Exec(ctx, "UPDATE accounts SET name=$2 WHERE id=$1", uid, in.Name); e == nil {
		_, e = tx.Exec(ctx, "INSERT INTO account_profiles(account_id) VALUES($1) ON CONFLICT DO NOTHING", uid)
	}
	if e == nil {
		_, e = tx.Exec(ctx, `UPDATE account_profiles SET phone=COALESCE($2,phone),gender=COALESCE($3,gender),
 birth_date=CASE WHEN $4 THEN NULL ELSE COALESCE($5::date,birth_date) END,avatar_color=COALESCE($6,avatar_color),
 default_payment=COALESCE($7,default_payment),default_vehicle=COALESCE($8,default_vehicle),company_name=COALESCE($9,company_name),business_gstin=COALESCE($10,business_gstin),cost_centre=COALESCE($11,cost_centre),work_email=COALESCE($12,work_email),updated_at=now() WHERE account_id=$1`,
			uid, in.Phone, in.Gender, clearBirth, birth, in.AvatarColor, in.DefaultPayment, in.DefaultVehicle, in.CompanyName, in.BusinessGSTIN, in.CostCentre, in.WorkEmail)
	}
	if e == nil {
		e = audit(ctx, tx, uid, "", "profile_updated", map[string]string{"scope": "details"})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if oldName != in.Name {
		s.dropLive(ctx, uid)
	}
	write(w, 200, map[string]string{"id": uid, "name": in.Name})
}

func (s *Server) addEmergencyContact(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Phone    string `json:"phone"`
		Relation string `json:"relation"`
	}
	if !decode(w, r, &in) {
		return
	}
	name, ok := cleanText(in.Name, 2, 60)
	relation, ok2 := cleanText(in.Relation, 0, 30)
	if !ok || !ok2 || !validPhone(in.Phone) {
		fail(w, 400, "Enter a name and a valid 10-digit mobile number")
		return
	}
	uid, ctx := user(r).Account.ID, r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var n int
	// Serialise per account so concurrent adds cannot exceed the cap.
	if _, e = tx.Exec(ctx, "SELECT 1 FROM accounts WHERE id=$1 FOR UPDATE", uid); e == nil {
		e = tx.QueryRow(ctx, "SELECT count(*) FROM emergency_contacts WHERE account_id=$1", uid).Scan(&n)
	}
	if e == nil && n >= maxEmergencyContacts {
		fail(w, 409, "You can add up to 5 emergency contacts")
		return
	}
	var id string
	if e == nil {
		e = tx.QueryRow(ctx, `INSERT INTO emergency_contacts(account_id,name,phone,relation) VALUES($1,$2,$3,$4)
 ON CONFLICT(account_id,phone) DO UPDATE SET name=EXCLUDED.name,relation=EXCLUDED.relation RETURNING id`, uid, name, in.Phone, relation).Scan(&id)
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

func (s *Server) deleteEmergencyContact(w http.ResponseWriter, r *http.Request) {
	tag, e := s.DB.Exec(r.Context(), "DELETE FROM emergency_contacts WHERE id=$1 AND account_id=$2", r.PathValue("id"), user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Contact not found")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// exportProfile returns the caller's own data so they can download it.
func (s *Server) exportProfile(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	queries := []struct{ key, sql string }{
		{"account", "SELECT id,email,name,role,created_at FROM accounts WHERE id=$1"},
		{"profile", "SELECT phone,gender,birth_date,avatar_color,default_payment,default_vehicle,company_name,business_gstin,cost_centre,work_email FROM account_profiles WHERE account_id=$1"},
		{"emergency_contacts", "SELECT name,phone,relation FROM emergency_contacts WHERE account_id=$1"},
		{"saved_locations", "SELECT label,kind,lat,lng,place_label FROM saved_locations WHERE account_id=$1"},
		{"rides", `SELECT r.id,r.status,r.payment_method,r.created_at,q.pickup_label,q.dropoff_label,q.meters,COALESCE(r.offered_fare_paise,q.fare_paise) AS fare_paise FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.rider_id=$1 ORDER BY r.created_at DESC LIMIT 1000`},
		{"wallet", "SELECT amount_paise,kind,note,created_at FROM wallet_entries WHERE account_id=$1 ORDER BY id DESC LIMIT 1000"},
	}
	out := map[string]any{"exported_at": time.Now().UTC()}
	for _, q := range queries {
		rows, e := jsonRows(ctx, s.DB, q.sql, uid)
		if e != nil {
			dbError(w, e)
			return
		}
		out[q.key] = rows
	}
	w.Header().Set("Content-Disposition", `attachment; filename="hop-my-data.json"`)
	write(w, 200, out)
}

// requestDeletion starts (or cancels) a 30-day account deletion window. The operator purges after it ends.
func (s *Server) requestDeletion(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Cancel bool `json:"cancel"`
	}
	if !decode(w, r, &in) {
		return
	}
	uid, ctx := user(r).Account.ID, r.Context()
	if !in.Cancel && s.hasActiveRide(ctx, uid) {
		fail(w, 409, "Finish or cancel your active ride before deleting your account")
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "INSERT INTO account_profiles(account_id) VALUES($1) ON CONFLICT DO NOTHING", uid); e == nil {
		_, e = tx.Exec(ctx, "UPDATE account_profiles SET deletion_requested_at=CASE WHEN $2 THEN NULL ELSE now() END,updated_at=now() WHERE account_id=$1", uid, in.Cancel)
	}
	if e == nil {
		action := "account_deletion_requested"
		if in.Cancel {
			action = "account_deletion_cancelled"
		}
		e = audit(ctx, tx, uid, "", action, map[string]bool{"cancel": in.Cancel})
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

func (s *Server) hasActiveRide(ctx context.Context, uid string) bool {
	var active bool
	e := s.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE (rider_id=$1 OR driver_id=$1) AND status IN ('requested','accepted','arrived','in_progress'))", uid).Scan(&active)
	return e != nil || active
}
