package app

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Media bytes live only in configured private object storage (memory in demo).
// PostgreSQL stores opaque references and integrity metadata. Images are
// re-encoded to remove EXIF and reject active/non-image content.
func normalizedPhoto(encoded string, maxBytes int) ([]byte, error) {
	raw, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil || len(raw) > maxBytes || len(raw) == 0 {
		return nil, errors.New("Choose a JPEG or PNG image within the upload limit")
	}
	cfg, format, e := image.DecodeConfig(bytes.NewReader(raw))
	if e != nil || (format != "jpeg" && format != "png") || cfg.Width < 64 || cfg.Height < 64 || cfg.Width > 2048 || cfg.Height > 2048 || cfg.Width*cfg.Height > 4194304 {
		return nil, errors.New("Choose a JPEG or PNG between 64 and 2048 pixels per side")
	}
	img, _, e := image.Decode(bytes.NewReader(raw))
	if e != nil {
		return nil, errors.New("Image could not be read")
	}
	// Bound output dimensions and storage without relying on browser validation.
	width, height := cfg.Width, cfg.Height
	if width > 1600 || height > 1600 {
		ratio := float64(1600) / float64(max(width, height))
		width = max(1, int(float64(width)*ratio))
		height = max(1, int(float64(height)*ratio))
	}
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	bounds := img.Bounds()
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			dst.Set(x, y, img.At(bounds.Min.X+x*cfg.Width/width, bounds.Min.Y+y*cfg.Height/height))
		}
	}
	var out bytes.Buffer
	if e = jpeg.Encode(&out, dst, &jpeg.Options{Quality: 82}); e != nil {
		return nil, e
	}
	if out.Len() > maxBytes {
		return nil, errors.New("Image is too large; crop or compress it and try again")
	}
	return out.Bytes(), nil
}

func (s *Server) uploadProfilePhoto(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Image string `json:"image"`
	}
	if !decode(w, r, &in) {
		return
	}
	uid, ctx := user(r).Account.ID, r.Context()
	if !s.limit(w, r, "photo:"+uid, 10, 3600) {
		return
	}
	content, e := normalizedPhoto(in.Image, 512*1024)
	if e != nil {
		fail(w, 400, e.Error())
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
	var active bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress'))", uid).Scan(&active); e != nil {
		dbError(w, e)
		return
	}
	if active {
		fail(w, 409, "Finish your active captain trip before changing your photo")
		return
	}
	key, e := s.storePrivateMedia(ctx, "portrait", content)
	if e != nil {
		fail(w, 503, "Private photo storage is unavailable. Try again later.")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO profile_photos(account_id,object_key) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET object_key=$2,approved=false,updated_at=now()`, uid, key)
	if e == nil {
		_, e = tx.Exec(ctx, "UPDATE drivers SET status='pending',online=false,pink_certified=false,review_note='Profile photo changed. Awaiting operator review.',updated_at=now() WHERE user_id=$1 AND status='approved'", uid)
	}
	if e == nil {
		e = audit(ctx, tx, uid, "", "photo_uploaded", nil)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	s.dropLive(ctx, uid)
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) deleteProfilePhoto(w http.ResponseWriter, r *http.Request) {
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
	var captain bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM drivers WHERE user_id=$1)", uid).Scan(&captain); e != nil {
		dbError(w, e)
		return
	}
	if captain {
		fail(w, 409, "Captains need a profile photo. Upload a replacement for review instead.")
		return
	}
	_, e = tx.Exec(ctx, "DELETE FROM profile_photos WHERE account_id=$1", uid)
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) profilePhoto(w http.ResponseWriter, r *http.Request) {
	uid, id, ctx := user(r).Account.ID, r.PathValue("id"), r.Context()
	if !uuidPattern.MatchString(id) {
		fail(w, 404, "Photo not found")
		return
	}
	var key string
	e := s.DB.QueryRow(ctx, `SELECT object_key FROM profile_photos f WHERE f.account_id=$1 AND
 ($1=$2::uuid OR $3::boolean OR (f.approved AND EXISTS(SELECT 1 FROM rides r WHERE r.driver_id=$1 AND r.rider_id=$2 AND (r.status IN ('accepted','arrived','in_progress') OR (r.status='completed' AND r.completed_at>now()-interval '7 days')))))`, id, uid, user(r).Account.Role == "operator").Scan(&key)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Photo not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	content, e := s.readPrivateMedia(ctx, "portrait", key)
	if e != nil {
		fail(w, 503, "Photo is temporarily unavailable")
		return
	}
	// JSON/base64 works with the same native authenticated HTTP cookie store as other APIs.
	write(w, 200, map[string]any{"image": base64.StdEncoding.EncodeToString(content), "content_type": "image/jpeg"})
}

type applicationDraft struct {
	Area             string `json:"area_id"`
	Category         string `json:"vehicle_category"`
	Vehicle          string `json:"vehicle_number"`
	Make             string `json:"vehicle_make"`
	Model            string `json:"vehicle_model"`
	Color            string `json:"vehicle_color"`
	UPI              string `json:"upi_id"`
	License          string `json:"license_reference"`
	Insurance        string `json:"insurance_reference"`
	LicenseExpires   string `json:"license_expires"`
	InsuranceExpires string `json:"insurance_expires"`
	Step             int    `json:"step"`
}

func (s *Server) onboardingState(w http.ResponseWriter, r *http.Request) {
	uid, ctx := user(r).Account.ID, r.Context()
	var draft json.RawMessage
	e := s.DB.QueryRow(ctx, "SELECT details FROM driver_application_drafts WHERE account_id=$1", uid).Scan(&draft)
	if errors.Is(e, pgx.ErrNoRows) {
		draft = json.RawMessage(`{}`)
	} else if e != nil {
		dbError(w, e)
		return
	}
	docs, e := jsonRows(ctx, s.DB, "SELECT kind,updated_at FROM driver_documents WHERE account_id=$1 ORDER BY kind", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	var photo, approved bool
	e = s.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM profile_photos WHERE account_id=$1),COALESCE((SELECT approved FROM profile_photos WHERE account_id=$1),false)", uid).Scan(&photo, &approved)
	if e != nil {
		dbError(w, e)
		return
	}
	mode := "unavailable"
	if _, ok := s.Media.(*memoryMedia); ok {
		mode = "development_memory"
	} else if _, ok := s.Media.(*localMedia); ok {
		mode = "local_storage"
	} else if s.Media != nil {
		mode = "private_cloud"
	}
	write(w, 200, map[string]any{"draft": draft, "documents": docs, "has_photo": photo, "photo_approved": approved, "storage_mode": mode, "phone_verified": hasMobile(ctx, s.DB, uid), "documents_required": !s.Config.Development, "testing_mode": s.Config.Development})
}
func (s *Server) saveOnboarding(w http.ResponseWriter, r *http.Request) {
	var in applicationDraft
	if !decode(w, r, &in) {
		return
	}
	for _, v := range []string{in.Area, in.Category, in.Vehicle, in.Make, in.Model, in.Color, in.UPI, in.License, in.Insurance, in.LicenseExpires, in.InsuranceExpires} {
		if len(v) > 160 || strings.ContainsAny(v, "\x00\r\n") {
			fail(w, 400, "Application fields must be at most 160 characters without control characters")
			return
		}
	}
	if in.Step < 0 || in.Step > 3 {
		fail(w, 400, "Invalid onboarding step")
		return
	}
	data, _ := json.Marshal(in)
	_, e := s.DB.Exec(r.Context(), `INSERT INTO driver_application_drafts(account_id,details) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET details=$2,updated_at=now()`, user(r).Account.ID, data)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func documentKind(kind string) bool {
	return kind == "identity" || kind == "license" || kind == "rc" || kind == "insurance"
}
func (s *Server) uploadDriverDocument(w http.ResponseWriter, r *http.Request) {
	kind, uid, ctx := r.PathValue("kind"), user(r).Account.ID, r.Context()
	if !documentKind(kind) {
		fail(w, 400, "Unsupported document type")
		return
	}
	if !s.limit(w, r, "document:"+uid, 20, 3600) {
		return
	}
	var in struct {
		Image string `json:"image"`
	}
	if !decode(w, r, &in) {
		return
	}
	content, e := normalizedPhoto(in.Image, 2*1024*1024)
	if e != nil {
		fail(w, 400, e.Error())
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
	var active bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress'))", uid).Scan(&active); e != nil {
		dbError(w, e)
		return
	}
	if active {
		fail(w, 409, "Finish your active trip before updating documents")
		return
	}
	key, e := s.storePrivateMedia(ctx, "kyc", content)
	if e != nil {
		fail(w, 503, "Private document storage is unavailable. Try again later.")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO driver_documents(account_id,kind,object_key,content_type) VALUES($1,$2,$3,'image/jpeg') ON CONFLICT(account_id,kind) DO UPDATE SET object_key=$3,content_type='image/jpeg',updated_at=now()`, uid, kind, key)
	if e == nil {
		_, e = tx.Exec(ctx, "UPDATE drivers SET status='pending',online=false,pink_certified=false,review_note='Documents updated. Awaiting operator review.',updated_at=now() WHERE user_id=$1 AND status='approved'", uid)
	}
	if e == nil {
		_, e = tx.Exec(ctx, "UPDATE driver_verifications SET identity_ok=false,license_ok=false,rc_ok=false,insurance_ok=false,vehicle_ok=false,police_ok=false WHERE driver_id=$1", uid)
	}
	if e == nil {
		e = audit(ctx, tx, uid, "", "document_uploaded", map[string]string{"kind": kind})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	s.dropLive(ctx, uid)
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) driverDocument(w http.ResponseWriter, r *http.Request) {
	uid, id, kind, ctx := user(r).Account.ID, r.PathValue("id"), r.PathValue("kind"), r.Context()
	if !uuidPattern.MatchString(id) || !documentKind(kind) || (uid != id && user(r).Account.Role != "operator") {
		fail(w, 404, "Document not found")
		return
	}
	var key, ct string
	e := s.DB.QueryRow(ctx, "SELECT object_key,content_type FROM driver_documents WHERE account_id=$1 AND kind=$2", id, kind).Scan(&key, &ct)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Document not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	// Audit before disclosing sensitive evidence, including operator reads.
	if _, e = s.DB.Exec(ctx, "INSERT INTO audit_events(actor_id,action,detail) VALUES($1,'document_viewed',$2)", uid, map[string]string{"account_id": id, "kind": kind}); e != nil {
		dbError(w, e)
		return
	}
	content, e := s.readPrivateMedia(ctx, "kyc", key)
	if e != nil {
		fail(w, 503, "Document is temporarily unavailable")
		return
	}
	write(w, 200, map[string]string{"image": base64.StdEncoding.EncodeToString(content), "content_type": ct})
}
