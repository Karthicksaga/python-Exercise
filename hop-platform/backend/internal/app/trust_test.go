package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func testPhoto(t *testing.T) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 96, 96))
	for y := 0; y < 96; y++ {
		for x := 0; x < 96; x++ {
			img.Set(x, y, color.RGBA{uint8(x * 2), uint8(y * 2), 120, 255})
		}
	}
	var out bytes.Buffer
	if e := jpeg.Encode(&out, img, nil); e != nil {
		t.Fatal(e)
	}
	return base64.StdEncoding.EncodeToString(out.Bytes())
}
func (f *fixture) uploadEvidence(c client) {
	f.t.Helper()
	photo := testPhoto(f.t)
	code, _ := f.call(c, "POST", "/api/profile/photo", map[string]string{"image": photo})
	require(f.t, code, 200)
	for _, kind := range requiredDocumentKinds {
		code, _ = f.call(c, "POST", "/api/drivers/documents/"+kind, map[string]string{"image": photo})
		require(f.t, code, 200)
	}
}

// acceptedDocuments is the per-document decision an operator sends when every required document checks out.
func acceptedDocuments() map[string]any {
	docs := map[string]any{}
	for _, kind := range requiredDocumentKinds {
		docs[kind] = map[string]string{"status": "accepted"}
	}
	return docs
}

func TestProfilePhoneOwnershipAndPurposeIsolation(t *testing.T) {
	f := setup(t)
	r, other := f.actor("rider", false), f.actor("rider", false)
	code, _ := f.call(r, "POST", "/api/profile", map[string]string{"name": "Asha", "phone": "9876543210"})
	require(t, code, 409)
	// Imported legacy profile numbers remain unverified until ownership is proven.
	if _, e := f.s.DB.Exec(t.Context(), "UPDATE account_profiles SET phone='9876543210' WHERE account_id=$1", r.id); e != nil {
		t.Fatal(e)
	}
	if hasMobile(t.Context(), f.s.DB, r.id) {
		t.Fatal("manually supplied phone counted as verified")
	}
	code, _ = f.call(r, "POST", "/api/rides", map[string]any{"quote_id": f.quote(r), "request_key": r.id, "payment_method": "cash"})
	require(t, code, 403)
	code, out := f.call(r, "POST", "/api/profile/phone/request", map[string]string{"phone": "9876543210"})
	require(t, code, 200)
	otp := out["dev_code"].(string)
	code, _ = f.call(other, "POST", "/api/profile/phone/verify", map[string]string{"phone": "9876543210", "code": otp})
	require(t, code, 400)
	code, _, _ = publicPost(t, f, "/auth/otp/verify", map[string]string{"phone": "9876543210", "code": otp}, nil)
	require(t, code, 400)
	code, _ = f.call(r, "POST", "/api/profile/phone/verify", map[string]string{"phone": "9876543210", "code": otp})
	require(t, code, 200)
	if !hasMobile(t.Context(), f.s.DB, r.id) {
		t.Fatal("verified ownership not recorded")
	}
	code, _ = f.call(r, "POST", "/api/profile/phone/verify", map[string]string{"phone": "9876543210", "code": otp})
	require(t, code, 400)
	code, _ = f.call(other, "POST", "/api/profile/phone/request", map[string]string{"phone": "9876543210"})
	require(t, code, 409)
	code, profile := f.call(r, "GET", "/api/profile", nil)
	require(t, code, 200)
	if profile["details"].([]any)[0].(map[string]any)["phone_verified"] != true {
		t.Fatal("badge does not follow exact verified number")
	}
	// A pending replacement does not remove the old verified number.
	code, _ = f.call(r, "POST", "/api/profile/phone/request", map[string]string{"phone": "9765432109"})
	require(t, code, 200)
	if !hasMobile(t.Context(), f.s.DB, r.id) {
		t.Fatal("pending replacement invalidated current ownership")
	}
}

func TestProductionOTPDoesNotExposeDevelopmentCodes(t *testing.T) {
	f := setup(t)
	f.s.Config.Development = false
	f.s.Config.ClientID = "hop-web"
	code, _, _ := publicPost(t, f, "/auth/otp/request", map[string]string{"phone": "9876543210"}, nil)
	require(t, code, 503)
	r := f.actor("rider", false)
	code, _ = f.call(r, "POST", "/api/profile/phone/request", map[string]string{"phone": "9876543210"})
	require(t, code, 503)
}

func TestPrivateEvidenceAndCaptainReapproval(t *testing.T) {
	f := setup(t)
	r, op, stranger := f.actor("rider", false), f.actor("operator", false), f.actor("rider", false)
	code, _ := f.call(r, "POST", "/api/profile/photo", map[string]string{"image": base64.StdEncoding.EncodeToString([]byte("<svg onload='alert(1)'/>"))})
	require(t, code, 400)
	f.uploadEvidence(r)
	code, _ = f.call(stranger, "GET", "/api/profile/photo/"+r.id, nil)
	require(t, code, 404)
	code, _ = f.call(stranger, "GET", "/api/drivers/documents/"+r.id+"/identity", nil)
	require(t, code, 404)
	code, _ = f.call(op, "GET", "/api/drivers/documents/"+r.id+"/identity", nil)
	require(t, code, 200)
	var audits int
	if e := f.s.DB.QueryRow(t.Context(), "SELECT count(*) FROM audit_events WHERE actor_id=$1 AND action='document_viewed'", op.id).Scan(&audits); e != nil || audits != 1 {
		t.Fatalf("document audit missing: %d %v", audits, e)
	}
	form := map[string]any{"area_id": f.area, "vehicle_category": "bike", "vehicle_number": "TN01AB1234", "vehicle_make": "Honda", "vehicle_model": "Shine", "vehicle_color": "Black", "license_reference": "DL-12345", "insurance_reference": "INS-12345", "license_expires": time.Now().AddDate(1, 0, 0).Format("2006-01-02"), "insurance_expires": time.Now().AddDate(1, 0, 0).Format("2006-01-02")}
	code, _ = f.call(r, "POST", "/api/drivers/apply", form)
	require(t, code, 201)
	code, _ = f.call(r, "POST", "/api/drivers/online", map[string]any{})
	require(t, code, 403)
	checks := map[string]any{"identity_ok": true, "license_ok": true, "rc_ok": true, "insurance_ok": true, "vehicle_ok": true, "police_ok": true, "police_reference": "TNPOL-2026-0101", "status": "approved", "note": "All applicant evidence reviewed privately", "documents": acceptedDocuments()}
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+r.id, checks)
	require(t, code, 200)
	code, _ = f.call(r, "POST", "/api/drivers/online", map[string]any{})
	require(t, code, 200)
	code, _ = f.call(r, "POST", "/api/profile/photo", map[string]string{"image": testPhoto(t)})
	require(t, code, 200)
	var approved, online bool
	var status string
	if e := f.s.DB.QueryRow(t.Context(), "SELECT f.approved,d.online,d.status FROM profile_photos f JOIN drivers d ON d.user_id=f.account_id WHERE d.user_id=$1", r.id).Scan(&approved, &online, &status); e != nil || approved || online || status != "pending" {
		t.Fatalf("changed portrait retained approval: %v %v %s %v", approved, online, status, e)
	}
	code, _ = f.call(r, "POST", "/api/drivers/online", map[string]any{})
	require(t, code, 403)
	f.s.Media = nil
	code, _ = f.call(stranger, "POST", "/api/profile/photo", map[string]string{"image": testPhoto(t)})
	require(t, code, 503)
}

func TestTripStatementSnapshotAuthorizationAndPayment(t *testing.T) {
	f := setup(t)
	r, d, stranger := f.actor("rider", false), f.actor("rider", true), f.actor("rider", false)
	code, _ := f.call(r, "POST", "/api/profile", map[string]string{"name": "Asha Kumar", "company_name": "Example Company", "cost_centre": "Engineering"})
	require(t, code, 200)
	id := f.book(r, f.quote(r))
	code, _ = f.call(r, "GET", "/api/rides/"+id+"/receipt", nil)
	require(t, code, 409)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	f.atDestination(d, id)
	require(t, f.act(d, id, "complete", 4, ""), 200)
	code, _ = f.call(stranger, "GET", "/api/rides/"+id+"/receipt", nil)
	require(t, code, 404)
	code, out := f.call(r, "GET", "/api/rides/"+id+"/receipt", nil)
	require(t, code, 200)
	if out["payment_status"] != "unconfirmed" {
		t.Fatal("completion marked unpaid trip as paid")
	}
	details := out["details"].(map[string]any)
	if details["total_paise"] != float64(5500) || details["company_name"] != "Example Company" {
		t.Fatalf("incorrect snapshot: %v", details)
	}
	pdf, e := base64.StdEncoding.DecodeString(out["pdf"].(string))
	if e != nil || !bytes.HasPrefix(pdf, []byte("%PDF-")) {
		t.Fatal("invalid PDF")
	}
	if path := os.Getenv("TEST_RECEIPT_PDF"); path != "" {
		if e = os.WriteFile(path, pdf, 0600); e != nil {
			t.Fatal(e)
		}
	}
	code, _ = f.call(r, "POST", "/api/profile", map[string]string{"name": "Changed Name", "company_name": "Changed Company"})
	require(t, code, 200)
	code, out = f.call(r, "GET", "/api/rides/"+id+"/receipt", nil)
	require(t, code, 200)
	if out["details"].(map[string]any)["rider_name"] != "Asha Kumar" {
		t.Fatal("profile edit rewrote issued statement")
	}
	code, driverView := f.call(d, "GET", "/api/rides/"+id+"/receipt", nil)
	require(t, code, 200)
	if _, exists := driverView["details"].(map[string]any)["company_name"]; exists {
		t.Fatal("captain received rider business details")
	}
	require(t, f.act(d, id, "payment_received", 5, ""), 200)
	code, out = f.call(r, "GET", "/api/rides/"+id+"/receipt", nil)
	require(t, code, 200)
	if out["payment_status"] != "driver_reported_received" || !strings.Contains(out["payment_description"].(string), "not bank-verified") {
		t.Fatal("direct payment described as independently verified")
	}
}

func TestRoadRankingAndOfferOutcomes(t *testing.T) {
	picks := []pick{{id: "near", dist: 100, score: 1}, {id: "far", dist: 500, score: 2}}
	ranked := rankCandidates(picks, map[string]float64{"near": 900, "far": 60}, 1)
	if len(ranked) != 1 || ranked[0].id != "far" || ranked[0].source != "road" {
		t.Fatal("ranking ignored road travel time")
	}
	f := setup(t)
	r, a, b := f.actor("rider", false), f.actor("rider", true), f.actor("rider", true)
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		write(w, 200, map[string]any{"code": "Ok", "durations": [][]float64{{90}, {100}}})
	}))
	defer router.Close()
	// Use the fixture router for quote creation, then inject a real table response.
	q := f.quote(r)
	f.s.Config.RoutingURL = router.URL
	id := f.book(r, q)
	code, _ := f.call(a, "POST", "/api/rides/"+id+"/offer-seen", map[string]any{})
	require(t, code, 200)
	require(t, f.act(a, id, "accept", 1, ""), 200)
	f.dispatch()
	var outcome string
	if e := f.s.DB.QueryRow(context.Background(), "SELECT outcome FROM ride_offers WHERE ride_id=$1 AND driver_id=$2", id, b.id).Scan(&outcome); e != nil || outcome != "superseded" {
		t.Fatalf("nonwinner unfairly penalized: %s %v", outcome, e)
	}
}

func TestUnreferencedMediaCleanupPreservesEvidence(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	f.uploadEvidence(r)
	key, e := f.s.storePrivateMedia(t.Context(), "kyc", []byte("orphan"))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = f.s.DB.Exec(t.Context(), "UPDATE media_objects SET created_at=now()-interval '2 days'"); e != nil {
		t.Fatal(e)
	}
	if e = f.s.CleanupMedia(t.Context()); e != nil {
		t.Fatal(e)
	}
	if _, e = f.s.Media.Get(t.Context(), "kyc", key); e == nil {
		t.Fatal("orphan was not removed")
	}
	code, _ := f.call(r, "GET", "/api/drivers/documents/"+r.id+"/identity", nil)
	require(t, code, 200)
}

func TestTestingModeDriverApplicationWithoutDocuments(t *testing.T) {
	f := setup(t)
	applicant := f.actor("rider", false)
	op := f.actor("operator", false)

	// In non-development mode without testing flag, missing documents fails
	f.s.Config.Development = false
	form := map[string]any{
		"area_id":             f.area,
		"vehicle_category":    "bike",
		"vehicle_number":      "TN01AB1234",
		"vehicle_make":        "Honda",
		"vehicle_model":       "Shine",
		"vehicle_color":       "Black",
		"license_reference":   "DL-12345",
		"insurance_reference": "INS-12345",
		"license_expires":     time.Now().AddDate(1, 0, 0).Format("2006-01-02"),
		"insurance_expires":   time.Now().AddDate(1, 0, 0).Format("2006-01-02"),
	}
	code, resp := f.call(applicant, "POST", "/api/drivers/apply", form)
	require(t, code, 400)
	if !strings.Contains(resp["error"].(string), "Upload your profile photo") {
		t.Fatalf("expected document requirement error, got %v", resp)
	}

	// Security: a client-sent testing flag must not bypass document checks outside development.
	form["testing"] = true
	form["test_mode"] = true
	form["test_bypass"] = true
	code, _ = f.call(applicant, "POST", "/api/drivers/apply", form)
	require(t, code, 400)

	// In development mode (Development=true), applying succeeds even with empty vehicle fields and no documents
	applicant2 := f.actor("rider", false)
	f.s.Config.Development = true
	code, _ = f.call(applicant2, "POST", "/api/drivers/apply", map[string]any{"area_id": f.area})
	require(t, code, 201)

	// Documents can still be uploaded and retrieved without 503 errors
	f.uploadEvidence(applicant2)
	code, doc := f.call(applicant2, "GET", "/api/drivers/documents/"+applicant2.id+"/identity", nil)
	require(t, code, 200)
	if doc["content_type"] != "image/jpeg" || doc["image"] == "" {
		t.Fatalf("unexpected document payload %v", doc)
	}

	// Profile photo can be retrieved
	code, photo := f.call(applicant2, "GET", "/api/profile/photo/"+applicant2.id, nil)
	require(t, code, 200)
	if photo["content_type"] != "image/jpeg" || photo["image"] == "" {
		t.Fatalf("unexpected photo payload %v", photo)
	}

	// Operator review and approval succeeds for the testing mode driver
	checks := map[string]any{
		"identity_ok":  true,
		"license_ok":   true,
		"rc_ok":        true,
		"insurance_ok": true,
		"vehicle_ok":   true,
		"police_ok":    true,
		"status":       "approved",
		"note":         "Approved in test mode",
	}
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+applicant2.id, checks)
	require(t, code, 200)

	// Outside development, an application created by the testing bypass cannot be approved without documents.
	applicant3 := f.actor("rider", false)
	code, _ = f.call(applicant3, "POST", "/api/drivers/apply", map[string]any{"area_id": f.area})
	require(t, code, 201)
	f.s.Config.Development = false
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+applicant3.id, checks)
	require(t, code, 400)
	f.s.Config.Development = true
}

// End-to-end document review: per-document rejection with reasons, version history,
// review claims, the approval evidence snapshot and expiry handling.
func TestDocumentReviewWorkflow(t *testing.T) {
	f := setup(t)
	f.s.Config.Development = false
	ctx := t.Context()
	captain, op, op2 := f.actor("rider", false), f.actor("operator", false), f.actor("operator", false)
	code, _ := f.call(captain, "POST", "/api/profile", map[string]string{"name": "Kavya"})
	require(t, code, 200)
	f.uploadEvidence(captain)
	form := map[string]any{"area_id": f.area, "vehicle_category": "bike", "vehicle_number": "TN01AB4321", "vehicle_make": "Honda", "vehicle_model": "Shine", "vehicle_color": "Black", "license_reference": "DL-777", "insurance_reference": "INS-777", "license_expires": time.Now().AddDate(1, 0, 0).Format("2006-01-02"), "insurance_expires": time.Now().AddDate(0, 0, 5).Format("2006-01-02")}
	code, _ = f.call(captain, "POST", "/api/drivers/apply", form)
	require(t, code, 201)

	// Claims: a second operator is told who is reviewing.
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+captain.id+"/claim", map[string]any{})
	require(t, code, 200)
	code, _ = f.call(op2, "POST", "/api/admin/drivers/"+captain.id+"/claim", map[string]any{})
	require(t, code, 409)
	code, _ = f.call(op2, "POST", "/api/admin/drivers/"+captain.id, map[string]any{"documents": map[string]any{"rc": map[string]string{"status": "accepted"}}})
	require(t, code, 409)

	// Rejection needs a reason; a rejected document can't be ticked as verified.
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+captain.id, map[string]any{"documents": map[string]any{"license_back": map[string]string{"status": "rejected"}}})
	require(t, code, 400)
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+captain.id, map[string]any{"license_ok": true, "documents": map[string]any{"license_back": map[string]string{"status": "rejected", "reason": "blurry"}}})
	require(t, code, 400)
	code, res := f.call(op, "POST", "/api/admin/drivers/"+captain.id, map[string]any{"documents": map[string]any{"license_back": map[string]string{"status": "rejected", "reason": "blurry"}}})
	require(t, code, 200)
	if res["status"] != "pending" {
		t.Fatalf("rejection must keep the captain pending: %v", res)
	}
	code, state := f.call(captain, "GET", "/api/drivers/onboarding", nil)
	require(t, code, 200)
	found := false
	for _, d := range state["documents"].([]any) {
		doc := d.(map[string]any)
		if doc["kind"] == "license_back" && doc["review_status"] == "rejected" && strings.Contains(doc["review_reason"].(string), "blurry") {
			found = true
		}
	}
	if !found {
		t.Fatalf("captain must see which document was rejected and why: %v", state["documents"])
	}
	var notes int
	if e := f.s.DB.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE account_id=$1 AND title LIKE 'Please re-upload%' AND body LIKE '%Driving licence (back)%'", captain.id).Scan(&notes); e != nil || notes != 1 {
		t.Fatalf("rejection notification missing: %d %v", notes, e)
	}

	// Re-upload: new version pending review, the rejected version is kept for audit.
	code, _ = f.call(captain, "POST", "/api/drivers/documents/license_back", map[string]string{"image": testPhoto(t)})
	require(t, code, 200)
	code, versions := f.call(op, "GET", "/api/admin/drivers/"+captain.id+"/documents", nil)
	require(t, code, 200)
	var backs []map[string]any
	for _, v := range versions["versions"].([]any) {
		if v.(map[string]any)["kind"] == "license_back" {
			backs = append(backs, v.(map[string]any))
		}
	}
	if len(backs) != 2 || backs[0]["review_status"] != "pending" || backs[1]["review_status"] != "rejected" || backs[1]["superseded_at"] == nil {
		t.Fatalf("document history not kept: %v", backs)
	}
	code, _ = f.call(op, "GET", fmt.Sprintf("/api/admin/document-versions/%v", backs[1]["id"]), nil)
	require(t, code, 200)

	// Approval with every document accepted records exactly which files were verified.
	checks := map[string]any{"identity_ok": true, "license_ok": true, "rc_ok": true, "insurance_ok": true, "vehicle_ok": true, "police_ok": true, "police_reference": "TNPOL-2026-0007", "status": "approved", "note": "All seven documents reviewed and match", "documents": acceptedDocuments()}
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+captain.id, checks)
	require(t, code, 200)
	var evidenceDocs int
	if e := f.s.DB.QueryRow(ctx, "SELECT count(*) FROM jsonb_object_keys((SELECT evidence->'documents' FROM driver_verifications WHERE driver_id=$1))", captain.id).Scan(&evidenceDocs); e != nil || evidenceDocs != len(requiredDocumentKinds) {
		t.Fatalf("approval evidence snapshot missing: %d %v", evidenceDocs, e)
	}
	var claimed *string
	_ = f.s.DB.QueryRow(ctx, "SELECT claimed_by::text FROM drivers WHERE user_id=$1", captain.id).Scan(&claimed)
	if claimed != nil {
		t.Fatal("a decision must release the review claim")
	}

	// Expiry: a reminder 7 days ahead is sent once; on expiry the captain goes offline with a clear message.
	for i := 0; i < 2; i++ {
		if e := f.s.CheckDocumentExpiry(ctx); e != nil {
			t.Fatal(e)
		}
	}
	var reminders int
	_ = f.s.DB.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE account_id=$1 AND title='Renew your insurance'", captain.id).Scan(&reminders)
	if reminders != 1 {
		t.Fatalf("expected exactly one insurance reminder, got %d", reminders)
	}
	if _, e := f.s.DB.Exec(ctx, "UPDATE drivers SET online=true,insurance_expires=(now() AT TIME ZONE 'Asia/Kolkata')::date-1 WHERE user_id=$1", captain.id); e != nil {
		t.Fatal(e)
	}
	if e := f.s.CheckDocumentExpiry(ctx); e != nil {
		t.Fatal(e)
	}
	var online bool
	var note string
	_ = f.s.DB.QueryRow(ctx, "SELECT online,review_note FROM drivers WHERE user_id=$1", captain.id).Scan(&online, &note)
	if online || !strings.Contains(note, "expired") {
		t.Fatalf("expired insurance must take the captain offline with a message: online=%v note=%q", online, note)
	}
}

func TestRegionCatalogZones(t *testing.T) {
	f := setup(t)
	rider, op := f.actor("rider", false), f.actor("operator", false)
	code, _ := f.call(rider, "GET", "/api/operator/regions", nil)
	require(t, code, 403)
	code, out := f.call(op, "GET", "/api/operator/regions?state=Tamil%20Nadu", nil)
	require(t, code, 200)
	regions, _ := out["regions"].([]any)
	if len(regions) != 38 {
		t.Fatalf("expected 38 Tamil Nadu districts, got %d", len(regions))
	}
	byID := map[string]map[string]any{}
	for _, r := range regions {
		row := r.(map[string]any)
		byID[row["id"].(string)] = row
	}
	if byID["tn-chennai"]["area_id"] == nil {
		t.Fatal("Chennai district should be linked to the seeded Chennai Metro zone")
	}
	madurai := byID["tn-madurai"]
	if madurai == nil || madurai["area_id"] != nil {
		t.Fatalf("Madurai should be available: %v", madurai)
	}
	zone := map[string]any{"name": "Madurai", "state": "Tamil Nadu", "catalog_id": "tn-madurai",
		"min_lat": madurai["min_lat"], "max_lat": madurai["max_lat"], "min_lng": madurai["min_lng"], "max_lng": madurai["max_lng"],
		"base_paise": 2500, "per_km_paise": 1200, "minimum_paise": 3000, "active": false}
	code, created := f.call(op, "POST", "/api/operator/areas", zone)
	require(t, code, 200)
	// One zone per district, with a message naming the existing zone.
	zone["name"] = "Madurai again"
	code, dup := f.call(op, "POST", "/api/operator/areas", zone)
	require(t, code, 409)
	if !strings.Contains(fmt.Sprint(dup["error"]), "Madurai") {
		t.Fatalf("duplicate message should name the zone: %v", dup)
	}
	// Editing the same zone keeps its district link.
	zone["id"], zone["name"] = created["id"], "Madurai City"
	code, _ = f.call(op, "POST", "/api/operator/areas", zone)
	require(t, code, 200)
	var link string
	if e := f.s.DB.QueryRow(t.Context(), "SELECT catalog_id FROM areas WHERE id=$1", created["id"]).Scan(&link); e != nil || link != "tn-madurai" {
		t.Fatalf("district link lost on edit: %q %v", link, e)
	}
	// Unknown districts and bounds outside India are refused.
	delete(zone, "id")
	zone["catalog_id"] = "tn-nowhere"
	code, _ = f.call(op, "POST", "/api/operator/areas", zone)
	require(t, code, 400)
	zone["catalog_id"], zone["min_lat"] = "", 40
	code, _ = f.call(op, "POST", "/api/operator/areas", zone)
	require(t, code, 400)
	// New zones from the catalogue stay off until activated with an approval reference.
	code, _ = f.call(op, "GET", "/api/config", nil)
	require(t, code, 200)
	var active bool
	if e := f.s.DB.QueryRow(t.Context(), "SELECT active FROM areas WHERE id=$1", created["id"]).Scan(&active); e != nil || active {
		t.Fatalf("catalogue zone must start inactive: %v %v", active, e)
	}
}
