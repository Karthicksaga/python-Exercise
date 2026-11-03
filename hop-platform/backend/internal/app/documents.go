package app

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Captain evidence rules live here so upload, application, approval and the
// operator console share one definition.

// requiredDocumentKinds must all be uploaded and accepted before approval.
// Indian ID, driving licence and RC smart cards carry details on both sides.
var requiredDocumentKinds = []string{"identity", "identity_back", "license", "license_back", "rc", "rc_back", "insurance"}

// optionalDocumentKinds can support a check (police clearance) without blocking an application.
var optionalDocumentKinds = []string{"police"}

func documentKind(kind string) bool {
	for _, k := range requiredDocumentKinds {
		if k == kind {
			return true
		}
	}
	for _, k := range optionalDocumentKinds {
		if k == kind {
			return true
		}
	}
	return false
}

// requiredKindsSQL is a fixed literal list for use inside SQL text (never user input).
func requiredKindsSQL() string {
	return "('" + strings.Join(requiredDocumentKinds, "','") + "')"
}

// requiredEvidenceSQL is true when the account ($1) has a portrait and every required document.
func requiredEvidenceSQL() string {
	return fmt.Sprintf(`EXISTS(SELECT 1 FROM profile_photos WHERE account_id=$1) AND (SELECT count(DISTINCT kind)=%d FROM driver_documents WHERE account_id=$1 AND kind IN %s)`,
		len(requiredDocumentKinds), requiredKindsSQL())
}

// Standard rejection reasons keep captain-facing messages clear and consistent.
var documentRejectionReasons = map[string]string{
	"blurry":     "The photo is blurry or unreadable. Retake it in good light.",
	"cropped":    "Part of the document is cut off. Capture all four corners.",
	"mismatch":   "Details don't match your application. Check the name and numbers.",
	"expired":    "This document has expired. Upload a valid one.",
	"wrong_type": "This isn't the requested document. Upload the correct one.",
	"glare":      "Glare or reflections hide details. Retake without flash.",
}

type documentDecision struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
	Note   string `json:"note"`
}

// documentReviewMessage turns a reason code (or custom note) into the captain-facing text.
func documentReviewMessage(d documentDecision) (string, error) {
	if d.Status != "accepted" && d.Status != "rejected" && d.Status != "pending" {
		return "", errors.New("Document status must be accepted, rejected or pending")
	}
	if d.Status != "rejected" {
		return "", nil
	}
	note := strings.TrimSpace(d.Note)
	if text, ok := documentRejectionReasons[d.Reason]; ok {
		if note != "" {
			text += " " + note
		}
		return truncate(text, 300), nil
	}
	if len(note) < 10 {
		return "", errors.New("Give a rejection reason so the captain knows what to fix")
	}
	return truncate(note, 300), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

var documentLabels = map[string]string{
	"identity": "ID (front)", "identity_back": "ID (back)", "license": "Driving licence (front)", "license_back": "Driving licence (back)",
	"rc": "RC (front)", "rc_back": "RC (back)", "insurance": "Insurance", "police": "Police clearance",
}

// recordDocumentVersion keeps every upload. The previous current version is marked superseded,
// never deleted, so evidence an operator reviewed remains available for audit.
func recordDocumentVersion(ctx context.Context, tx pgx.Tx, account, kind, key string) error {
	if _, e := tx.Exec(ctx, `UPDATE driver_document_versions SET superseded_at=now() WHERE account_id=$1 AND kind=$2 AND superseded_at IS NULL`, account, kind); e != nil {
		return e
	}
	_, e := tx.Exec(ctx, `INSERT INTO driver_document_versions(account_id,kind,object_key) VALUES($1,$2,$3)`, account, kind, key)
	return e
}

// claimTimeout lets another operator take over an abandoned review.
const claimTimeout = 30 * time.Minute

// adminClaim lets an operator claim (or release) an application so two people don't review it at once.
func (s *Server) adminClaim(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Release bool `json:"release"`
	}
	if !decode(w, r, &in) {
		return
	}
	id, me, ctx := r.PathValue("id"), user(r).Account.ID, r.Context()
	if !uuidPattern.MatchString(id) {
		fail(w, 404, "Driver not found")
		return
	}
	if in.Release {
		_, e := s.DB.Exec(ctx, `UPDATE drivers SET claimed_by=NULL,claimed_at=NULL WHERE user_id=$1 AND claimed_by=$2`, id, me)
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	}
	var holder string
	e := s.DB.QueryRow(ctx, `UPDATE drivers SET claimed_by=$2,claimed_at=now()
 WHERE user_id=$1 AND (claimed_by IS NULL OR claimed_by=$2 OR claimed_at<now()-make_interval(secs=>$3))
 RETURNING claimed_by::text`, id, me, claimTimeout.Seconds()).Scan(&holder)
	if errors.Is(e, pgx.ErrNoRows) {
		var name string
		_ = s.DB.QueryRow(ctx, `SELECT a.name FROM drivers d JOIN accounts a ON a.id=d.claimed_by WHERE d.user_id=$1`, id).Scan(&name)
		if name == "" {
			fail(w, 404, "Driver not found")
			return
		}
		fail(w, 409, name+" is reviewing this application")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// adminDocumentVersions lists every uploaded version for an applicant (newest first).
func (s *Server) adminDocumentVersions(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		fail(w, 404, "Driver not found")
		return
	}
	rows, e := jsonRows(r.Context(), s.DB, `SELECT v.id,v.kind,v.uploaded_at,v.superseded_at,v.review_status,v.review_reason,v.reviewed_at,COALESCE(a.name,'') AS reviewed_by
 FROM driver_document_versions v LEFT JOIN accounts a ON a.id=v.reviewed_by WHERE v.account_id=$1 ORDER BY v.kind,v.uploaded_at DESC`, id)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"versions": rows})
}

// adminDocumentVersion returns one historical version. Every view is audited before disclosure.
func (s *Server) adminDocumentVersion(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	versionID, e := strconv.ParseInt(r.PathValue("version"), 10, 64)
	if e != nil || versionID <= 0 {
		fail(w, 404, "Document not found")
		return
	}
	ctx := r.Context()
	var account, kind, key string
	e = s.DB.QueryRow(ctx, `SELECT account_id::text,kind,object_key FROM driver_document_versions WHERE id=$1`, versionID).Scan(&account, &kind, &key)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Document not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if _, e = s.DB.Exec(ctx, "INSERT INTO audit_events(actor_id,action,detail) VALUES($1,'document_viewed',$2)", user(r).Account.ID, map[string]any{"account_id": account, "kind": kind, "version": versionID}); e != nil {
		dbError(w, e)
		return
	}
	content, e := s.readPrivateMedia(ctx, "kyc", key)
	if e != nil {
		fail(w, 503, "Document is temporarily unavailable")
		return
	}
	write(w, 200, map[string]string{"image": base64.StdEncoding.EncodeToString(content), "content_type": "image/jpeg"})
}

// RunCompliance sends licence/insurance expiry reminders (30, 7 and 1 day) and, on expiry,
// takes the captain offline with a clear renewal message. Each message is sent once per expiry date.
func (s *Server) RunCompliance(ctx context.Context) {
	run := func() {
		job, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		if e := s.CheckDocumentExpiry(job); e != nil {
			slog.Error("document expiry check failed", "error", e)
		}
	}
	run()
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}

func (s *Server) CheckDocumentExpiry(ctx context.Context) error {
	type due struct {
		driver, document, threshold string
		expires                     time.Time
	}
	rows, e := s.DB.Query(ctx, `WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d),
 docs AS (
   SELECT user_id, 'license' AS document, license_expires AS expires FROM drivers WHERE status='approved'
   UNION ALL SELECT user_id, 'insurance', insurance_expires FROM drivers WHERE status='approved'),
 staged AS (
   SELECT user_id, document, expires, CASE
     WHEN expires < (SELECT d FROM today) THEN 'expired'
     WHEN expires <= (SELECT d FROM today) + 1 THEN '1d'
     WHEN expires <= (SELECT d FROM today) + 7 THEN '7d'
     WHEN expires <= (SELECT d FROM today) + 30 THEN '30d' END AS threshold
   FROM docs)
 SELECT user_id::text, document, threshold, expires FROM staged s
 WHERE threshold IS NOT NULL AND NOT EXISTS (SELECT 1 FROM compliance_reminders c
   WHERE c.driver_id=s.user_id AND c.document=s.document AND c.threshold=s.threshold AND c.expires=s.expires)
 LIMIT 500`)
	if e != nil {
		return e
	}
	var items []due
	for rows.Next() {
		var d due
		if e = rows.Scan(&d.driver, &d.document, &d.threshold, &d.expires); e != nil {
			rows.Close()
			return e
		}
		items = append(items, d)
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return e
	}
	for _, d := range items {
		if e = s.sendExpiryNotice(ctx, d.driver, d.document, d.threshold, d.expires); e != nil {
			return e
		}
	}
	return nil
}

func (s *Server) sendExpiryNotice(ctx context.Context, driver, document, threshold string, expires time.Time) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	tag, e := tx.Exec(ctx, `INSERT INTO compliance_reminders(driver_id,document,threshold,expires) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, driver, document, threshold, expires)
	if e != nil || tag.RowsAffected() == 0 {
		return e
	}
	label := map[string]string{"license": "driving licence", "insurance": "insurance"}[document]
	date := expires.Format("2 Jan 2006")
	title, body := "Renew your "+label, fmt.Sprintf("Your %s expires on %s. Upload the renewal in Vehicle & documents to keep receiving rides.", label, date)
	if threshold == "expired" {
		title = "Your " + label + " has expired"
		body = fmt.Sprintf("Your %s expired on %s, so you can't receive rides. Upload the renewal in Vehicle & documents for review.", label, date)
		if _, e = tx.Exec(ctx, `UPDATE drivers SET online=false,review_note=$2,updated_at=now() WHERE user_id=$1`, driver, truncate(body, 1000)); e != nil {
			return e
		}
		if e = audit(ctx, tx, "", "", "document_expired", map[string]string{"driver_id": driver, "document": document, "expires": date}); e != nil {
			return e
		}
	}
	if e = notify(ctx, tx, driver, "vehicle", title, body); e != nil {
		return e
	}
	if e = tx.Commit(ctx); e != nil {
		return e
	}
	if threshold == "expired" {
		s.dropLive(ctx, driver)
	}
	return nil
}
