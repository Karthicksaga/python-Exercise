package app

import (
	"bytes"
	"context"
	"encoding/base64"
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
	for _, kind := range []string{"identity", "license", "rc", "insurance"} {
		code, _ = f.call(c, "POST", "/api/drivers/documents/"+kind, map[string]string{"image": photo})
		require(f.t, code, 200)
	}
}

func TestProfilePhoneOwnershipAndPurposeIsolation(t *testing.T) {
	f := setup(t)
	r, other := f.actor("rider", false), f.actor("rider", false)
	code, _ := f.call(r, "POST", "/api/profile", map[string]string{"name": "Asha", "phone": "9876543210"})
	require(t, code, 200)
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
	checks := map[string]any{"identity_ok": true, "license_ok": true, "rc_ok": true, "insurance_ok": true, "vehicle_ok": true, "police_ok": true, "status": "approved", "note": "All applicant evidence reviewed privately"}
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
