package app

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAreaChangeRoutesRequireAuth(t *testing.T) {
	server := &Server{Config: Config{Development: true}}
	handler := server.Handler()

	// Unauthenticated request to /api/drivers/area should be rejected with 401 Unauthorized, not 404 Not Found
	req := httptest.NewRequest("POST", "/api/drivers/area", bytes.NewBufferString(`{"area_id":"11111111-1111-1111-1111-111111111111"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for unauthenticated driver area change, got %d", res.Code)
	}

	// Unauthenticated request to /api/operator/area-changes/{id} should also be rejected with 401 Unauthorized
	reqAdmin := httptest.NewRequest("POST", "/api/operator/area-changes/11111111-1111-1111-1111-111111111111", bytes.NewBufferString(`{"status":"approved","note":"Approved zone switch"}`))
	reqAdmin.Header.Set("Content-Type", "application/json")
	resAdmin := httptest.NewRecorder()
	handler.ServeHTTP(resAdmin, reqAdmin)

	if resAdmin.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for unauthenticated operator review, got %d", resAdmin.Code)
	}
}

func TestAreaChangeLifecycle(t *testing.T) {
	f := setup(t)
	driver := f.actor("rider", true)
	op := f.actor("operator", false)

	// Create second area
	var area2 string
	if err := f.s.DB.QueryRow(t.Context(), `INSERT INTO areas(name,state,min_lat,max_lat,min_lng,max_lng,base_paise,per_km_paise,minimum_paise,active,approval_reference) VALUES('Second area','Second state',13,15,80,82,1500,800,2500,true,'test 2') RETURNING id::text`).Scan(&area2); err != nil {
		t.Fatal(err)
	}

	// 1. Driver requests area change
	status, res := f.call(driver, "POST", "/api/drivers/area", map[string]any{"area_id": area2})
	if status != 200 {
		t.Fatalf("expected 200 from POST /api/drivers/area, got %d: %v", status, res)
	}

	// 2. Query driver's state
	status, stateRes := f.call(driver, "GET", "/api/state", nil)
	if status != 200 {
		t.Fatalf("expected 200 from GET /api/state, got %d: %v", status, stateRes)
	}
	changes, ok := stateRes["area_change"].([]any)
	if !ok || len(changes) == 0 {
		t.Fatalf("expected area_change in state, got %v", stateRes["area_change"])
	}
	reqID := changes[0].(map[string]any)["id"].(string)

	// 3. Operator reviews and approves
	status, opRes := f.call(op, "POST", "/api/operator/area-changes/"+reqID, map[string]any{
		"status": "approved",
		"note":   "Approved transfer to Second area",
	})
	if status != 200 {
		t.Fatalf("expected 200 from POST /api/operator/area-changes, got %d: %v", status, opRes)
	}

	// 4. Verify driver's area updated in DB and online set to false
	var updatedArea string
	var online bool
	if err := f.s.DB.QueryRow(t.Context(), "SELECT area_id::text, online FROM drivers WHERE user_id=$1", driver.id).Scan(&updatedArea, &online); err != nil {
		t.Fatal(err)
	}
	if updatedArea != area2 {
		t.Fatalf("expected driver area to be %s, got %s", area2, updatedArea)
	}
	if online {
		t.Fatalf("expected driver to be set offline after area transfer")
	}
}
