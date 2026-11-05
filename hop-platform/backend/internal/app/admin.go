package app

import (
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Operator console: review captain evidence document by document, then enable the captain
// and optionally certify them for pink rides. One code path enforces every rule.

func (s *Server) adminDrivers(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	q := r.URL.Query()
	status := q.Get("status")
	if status != "" && status != "all" && status != "pending" && status != "approved" && status != "suspended" {
		fail(w, 400, "Unknown status filter")
		return
	}
	if status == "all" {
		status = ""
	}
	area := q.Get("area_id")
	if area != "" && !uuidPattern.MatchString(area) {
		fail(w, 400, "Unknown area")
		return
	}
	search := strings.TrimSpace(q.Get("q"))
	if len(search) > 80 {
		search = search[:80]
	}
	// ILIKE wildcards in the search text are matched literally.
	search = strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(search)
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	offset, _ := strconv.Atoi(q.Get("offset"))
	if offset < 0 || offset > 100000 {
		offset = 0
	}
	expiring := q.Get("expiring") == "1"
	rows, e := jsonRows(r.Context(), s.DB, `SELECT d.user_id AS id,a.name,a.email,COALESCE(NULLIF(p.phone,''),CASE WHEN a.issuer='phone' THEN a.subject ELSE '' END) AS phone,COALESCE(p.gender,'') AS gender,
 d.status,d.online,d.vehicle_make,d.vehicle_model,d.vehicle_color,d.onboarding_version,
 EXISTS(SELECT 1 FROM verified_phones v WHERE v.account_id=d.user_id AND v.phone=COALESCE(NULLIF(p.phone,''),CASE WHEN a.issuer='phone' THEN a.subject ELSE '' END)) AS phone_verified,
 EXISTS(SELECT 1 FROM profile_photos f WHERE f.account_id=d.user_id) AS has_photo,
 (SELECT COALESCE(json_agg(kind ORDER BY kind),'[]'::json) FROM driver_documents WHERE account_id=d.user_id) AS documents,
 (SELECT COALESCE(json_agg(json_build_object('kind',kind,'status',review_status,'reason',review_reason,'updated_at',updated_at) ORDER BY kind),'[]'::json) FROM driver_documents WHERE account_id=d.user_id) AS document_reviews,
 ar.name AS area,d.area_id AS area_id,d.vehicle_category,d.vehicle_number,d.license_reference,d.insurance_reference,d.license_expires,d.insurance_expires,
 d.license_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date OR d.insurance_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date AS docs_expired,
 LEAST(d.license_expires,d.insurance_expires) AS next_expiry,
 d.review_note,d.pink_certified,d.updated_at,d.submitted_at,d.reviewed_at,
 d.claimed_by,d.claimed_at,COALESCE(c.name,'') AS claimed_name,
 COALESCE(v.identity_ok,false) AS identity_ok,COALESCE(v.license_ok,false) AS license_ok,COALESCE(v.rc_ok,false) AS rc_ok,
 COALESCE(v.insurance_ok,false) AS insurance_ok,COALESCE(v.vehicle_ok,false) AS vehicle_ok,COALESCE(v.police_ok,false) AS police_ok,
 COALESCE(v.gender_ok,false) AS gender_ok,COALESCE(v.police_reference,'') AS police_reference,
 (SELECT count(*) FROM rides WHERE driver_id=d.user_id AND status='completed') AS trips
 FROM drivers d JOIN accounts a ON a.id=d.user_id JOIN areas ar ON ar.id=d.area_id
 LEFT JOIN account_profiles p ON p.account_id=d.user_id LEFT JOIN driver_verifications v ON v.driver_id=d.user_id
 LEFT JOIN accounts c ON c.id=d.claimed_by
 WHERE ($1='' OR d.status=$1) AND ($2='' OR d.area_id=$2::uuid)
   AND ($3='' OR a.name ILIKE '%'||$3||'%' OR d.vehicle_number ILIKE '%'||$3||'%' OR COALESCE(p.phone,'') LIKE '%'||$3||'%' OR a.subject LIKE '%'||$3||'%')
   AND (NOT $4 OR LEAST(d.license_expires,d.insurance_expires) <= (now() AT TIME ZONE 'Asia/Kolkata')::date + 30)
 ORDER BY (d.status='pending') DESC, CASE WHEN d.status='pending' THEN d.submitted_at END ASC NULLS LAST, d.updated_at DESC
 LIMIT $5 OFFSET $6`, status, area, search, expiring, limit, offset)
	if e != nil {
		dbError(w, e)
		return
	}
	var pending, approved, suspended, pink, expiringCount int
	if e = s.DB.QueryRow(r.Context(), `SELECT count(*) FILTER (WHERE status='pending'),count(*) FILTER (WHERE status='approved'),count(*) FILTER (WHERE status='suspended'),
 count(*) FILTER (WHERE pink_certified),count(*) FILTER (WHERE status='approved' AND LEAST(license_expires,insurance_expires) <= (now() AT TIME ZONE 'Asia/Kolkata')::date + 30) FROM drivers`).Scan(
		&pending, &approved, &suspended, &pink, &expiringCount); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"drivers": rows, "counts": map[string]int{"pending": pending, "approved": approved, "suspended": suspended, "pink": pink, "expiring": expiringCount},
		"required_documents": requiredDocumentKinds, "optional_documents": optionalDocumentKinds, "rejection_reasons": documentRejectionReasons, "limit": limit, "offset": offset})
}

// checkDocuments maps each verification check to the documents it depends on.
var checkDocuments = map[string][]string{
	"identity_ok": {"identity", "identity_back"}, "license_ok": {"license", "license_back"},
	"rc_ok": {"rc", "rc_back"}, "insurance_ok": {"insurance"},
}

func (s *Server) adminDecision(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Identity        bool                        `json:"identity_ok"`
		License         bool                        `json:"license_ok"`
		RC              bool                        `json:"rc_ok"`
		Insurance       bool                        `json:"insurance_ok"`
		Vehicle         bool                        `json:"vehicle_ok"`
		Police          bool                        `json:"police_ok"`
		Gender          bool                        `json:"gender_ok"`
		Pink            bool                        `json:"pink_certified"`
		PoliceReference string                      `json:"police_reference"`
		Documents       map[string]documentDecision `json:"documents"`
		Status          string                      `json:"status"`
		Note            string                      `json:"note"`
		AreaID          string                      `json:"area_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.AreaID = strings.TrimSpace(in.AreaID)
	in.Note = strings.TrimSpace(in.Note)
	in.PoliceReference = strings.TrimSpace(in.PoliceReference)
	id, me := r.PathValue("id"), user(r).Account.ID
	if !uuidPattern.MatchString(id) {
		fail(w, 404, "Driver not found")
		return
	}
	if id == me {
		fail(w, 403, "An operator cannot verify their own driver application")
		return
	}
	if in.Status != "" && in.Status != "approved" && in.Status != "suspended" && in.Status != "pending" {
		fail(w, 400, "Status must be approved, suspended or pending")
		return
	}
	if in.Status != "" && (len(in.Note) < 10 || len(in.Note) > 1000) {
		fail(w, 400, "Add a review note of 10–1000 characters")
		return
	}
	if len(in.PoliceReference) > 80 {
		fail(w, 400, "Police reference must be at most 80 characters")
		return
	}
	messages := map[string]string{}
	for kind, d := range in.Documents {
		if !documentKind(kind) {
			fail(w, 400, "Unknown document type "+kind)
			return
		}
		msg, e := documentReviewMessage(d)
		if e != nil {
			fail(w, 400, documentLabels[kind]+": "+e.Error())
			return
		}
		messages[kind] = msg
	}
	complete := in.Identity && in.License && in.RC && in.Insurance && in.Vehicle && in.Police
	if in.Status == "approved" && !complete {
		fail(w, 400, "Tick every verification check before enabling the driver")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if e = lockJourney(ctx, tx, id); e != nil {
		dbError(w, e)
		return
	}
	var status, gender, claimHolder string
	var expired, claimFresh bool
	e = tx.QueryRow(ctx, `SELECT d.status,COALESCE(p.gender,''),
 d.license_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date OR d.insurance_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date,
 COALESCE(c.name,''), d.claimed_by IS NOT NULL AND d.claimed_by<>$2 AND d.claimed_at>now()-make_interval(secs=>$3)
 FROM drivers d LEFT JOIN account_profiles p ON p.account_id=d.user_id LEFT JOIN accounts c ON c.id=d.claimed_by
 WHERE d.user_id=$1 FOR UPDATE OF d`, id, me, claimTimeout.Seconds()).Scan(&status, &gender, &expired, &claimHolder, &claimFresh)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Driver not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if claimFresh {
		fail(w, 409, claimHolder+" is reviewing this application")
		return
	}

	// 1. Per-document decisions apply to the current version only.
	for kind, d := range in.Documents {
		tag, e := tx.Exec(ctx, `UPDATE driver_documents SET review_status=$3,review_reason=$4,reviewed_by=$5,reviewed_at=now() WHERE account_id=$1 AND kind=$2`, id, kind, d.Status, messages[kind], me)
		if e != nil {
			dbError(w, e)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 400, documentLabels[kind]+" has not been uploaded")
			return
		}
		if _, e = tx.Exec(ctx, `UPDATE driver_document_versions SET review_status=$3,review_reason=$4,reviewed_by=$5,reviewed_at=now() WHERE account_id=$1 AND kind=$2 AND superseded_at IS NULL`, id, kind, d.Status, messages[kind], me); e != nil {
			dbError(w, e)
			return
		}
	}
	docStatus, reasons := map[string]string{}, map[string]string{}
	rows, e := tx.Query(ctx, `SELECT kind,review_status,review_reason FROM driver_documents WHERE account_id=$1`, id)
	if e != nil {
		dbError(w, e)
		return
	}
	for rows.Next() {
		var k, st, reason string
		if e = rows.Scan(&k, &st, &reason); e != nil {
			rows.Close()
			dbError(w, e)
			return
		}
		docStatus[k], reasons[k] = st, reason
	}
	rows.Close()
	var rejected []string
	for k, st := range docStatus {
		if st == "rejected" {
			rejected = append(rejected, k)
		}
	}
	sort.Strings(rejected)

	// 2. A tick can't contradict the evidence: no "verified" check on a rejected document.
	ticks := map[string]bool{"identity_ok": in.Identity, "license_ok": in.License, "rc_ok": in.RC, "insurance_ok": in.Insurance}
	for check, kinds := range checkDocuments {
		if !ticks[check] {
			continue
		}
		for _, k := range kinds {
			if docStatus[k] == "rejected" {
				fail(w, 400, fmt.Sprintf("%s is rejected, so it can't be marked verified", documentLabels[k]))
				return
			}
		}
	}

	next := status
	if in.Status != "" {
		next = in.Status
	}
	// Rejected evidence always sends an approved captain back to review (and offline).
	if len(rejected) > 0 && next == "approved" {
		if in.Status == "approved" {
			fail(w, 400, "Resolve rejected documents before enabling the captain")
			return
		}
		next = "pending"
	}
	if next == "approved" {
		if !complete {
			fail(w, 400, "Every verification check is required to keep a captain enabled")
			return
		}
		testingBypass := false
		if s.Config.TestOnboarding {
			_ = tx.QueryRow(ctx, `SELECT onboarding_version=0 FROM drivers WHERE user_id=$1`, id).Scan(&testingBypass)
		}
		if !testingBypass {
			var ready bool
			if e = tx.QueryRow(ctx, `SELECT `+requiredEvidenceSQL(), id).Scan(&ready); e != nil {
				dbError(w, e)
				return
			}
			if !ready {
				fail(w, 400, "Verified mobile, photo and all onboarding documents are required before approval")
				return
			}
			for _, k := range requiredDocumentKinds {
				if docStatus[k] != "accepted" {
					fail(w, 400, documentLabels[k]+" must be reviewed and accepted before approval")
					return
				}
			}
			if in.Police && in.PoliceReference == "" && docStatus["police"] != "accepted" {
				fail(w, 400, "Police verification needs an accepted police clearance certificate or a police reference number")
				return
			}
		}
		if !hasMobile(ctx, tx, id) {
			fail(w, 400, "Verified mobile, photo and all onboarding documents are required before approval")
			return
		}
		if expired {
			fail(w, 400, "Driver documents have expired")
			return
		}
	}
	if in.Pink && (gender != "female" || !in.Gender) {
		fail(w, 400, "Pink certification needs the driver's gender to be female and verified against their ID")
		return
	}
	if in.Pink && next != "approved" {
		fail(w, 400, "Enable the driver before certifying for pink rides")
		return
	}

	// 3. Record the checklist and, on approval, exactly which files were verified.
	_, e = tx.Exec(ctx, `INSERT INTO driver_verifications(driver_id,identity_ok,license_ok,rc_ok,insurance_ok,vehicle_ok,police_ok,gender_ok,police_reference,verified_by,evidence)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $11 THEN (SELECT jsonb_build_object('documents',COALESCE(jsonb_object_agg(kind,object_key),'{}'::jsonb),
   'portrait',(SELECT object_key FROM profile_photos WHERE account_id=$1),'approved_at',now()) FROM driver_documents WHERE account_id=$1) ELSE '{}'::jsonb END)
 ON CONFLICT(driver_id) DO UPDATE SET identity_ok=$2,license_ok=$3,rc_ok=$4,insurance_ok=$5,vehicle_ok=$6,police_ok=$7,gender_ok=$8,police_reference=$9,verified_by=$10,updated_at=now(),
   evidence=CASE WHEN $11 THEN EXCLUDED.evidence ELSE driver_verifications.evidence END`,
		id, in.Identity, in.License, in.RC, in.Insurance, in.Vehicle, in.Police, in.Gender, in.PoliceReference, me, next == "approved")
	if e == nil && next == "approved" && complete {
		_, e = tx.Exec(ctx, "UPDATE profile_photos SET approved=true WHERE account_id=$1", id)
	}
	if e == nil && in.AreaID != "" {
		var active bool
		if e = tx.QueryRow(ctx, "SELECT active FROM areas WHERE id=$1::uuid", in.AreaID).Scan(&active); e != nil || !active {
			fail(w, 400, "Selected service area is invalid or inactive")
			return
		}
		if _, e = tx.Exec(ctx, "UPDATE drivers SET area_id=$2::uuid,online=false,updated_at=now() WHERE user_id=$1::uuid AND area_id<>$2::uuid", id, in.AreaID); e != nil {
			dbError(w, e)
			return
		}
		s.dropLive(ctx, id)
		_, _ = tx.Exec(ctx, "UPDATE area_change_requests SET status='approved',review_note='Area updated directly by operator',reviewed_by=$2::uuid,reviewed_at=now() WHERE driver_id=$1::uuid AND status='pending'", id, me)
	}
	note := in.Note
	if note == "" && len(rejected) > 0 {
		note = "Some documents need to be uploaded again."
	}
	decided := next != status || in.Status != ""
	if e == nil {
		_, e = tx.Exec(ctx, `UPDATE drivers SET status=$2,pink_certified=$3,online=online AND $2='approved',
 review_note=CASE WHEN $4<>'' THEN $4 ELSE review_note END,reviewed_by=$5,reviewed_at=now(),updated_at=now(),
 claimed_by=CASE WHEN $6 THEN NULL ELSE claimed_by END,claimed_at=CASE WHEN $6 THEN NULL ELSE claimed_at END WHERE user_id=$1`,
			id, next, in.Pink && next == "approved", note, me, decided)
	}
	if e == nil {
		e = audit(ctx, tx, me, "", "driver_verified", map[string]any{"driver_id": id, "status": next, "pink": in.Pink, "complete": complete, "documents": in.Documents, "police_reference": in.PoliceReference != ""})
	}
	// 4. Tell the captain exactly what to fix.
	newlyRejected := false
	for _, d := range in.Documents {
		if d.Status == "rejected" {
			newlyRejected = true
		}
	}
	if e == nil && newlyRejected {
		var lines []string
		for _, k := range rejected {
			lines = append(lines, documentLabels[k]+": "+reasons[k])
		}
		e = notify(ctx, tx, id, "vehicle", fmt.Sprintf("Please re-upload %d document(s)", len(rejected)), truncate(strings.Join(lines, " "), 1000))
	} else if e == nil && next != status {
		title, body := "Account "+next, in.Note
		if next == "approved" {
			title, body = "You're approved to drive", "Your documents and vehicle were verified. Go online to receive rides."
		}
		e = notify(ctx, tx, id, "vehicle", title, body)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if next != "approved" {
		s.dropLive(ctx, id)
	}
	write(w, 200, map[string]any{"ok": true, "status": next, "rejected": rejected})
}
