package app

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBackendDoesNotServeUI(t *testing.T) {
	server := &Server{Config: Config{Development: true}}
	for _, path := range []string{"/", "/captain", "/admin", "/assets/app.js", "/sw.js", "/unknown"} {
		request := httptest.NewRequest("GET", path, nil)
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, request)
		if response.Code != 404 {
			t.Fatalf("%s: got %d", path, response.Code)
		}
		if !strings.HasPrefix(response.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("%s served non-API content", path)
		}
	}
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/healthz", nil))
	if response.Code != 200 {
		t.Fatal("health endpoint unavailable")
	}
}
