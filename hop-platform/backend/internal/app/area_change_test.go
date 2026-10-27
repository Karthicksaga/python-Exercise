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
