package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestProductionRoutes(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("Notespace"), 0600); err != nil {
		t.Fatal(err)
	}
	handler := routes(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }), dir)
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/", 200}, {"GET", "/projects/example", 200}, {"GET", "/assets/missing.js", 404},
		{"PATCH", "/api/projects/example", 204}, {"GET", "/api/health", 204}, {"POST", "/", 405},
	} {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(tc.method, tc.path, nil))
		if res.Code != tc.status {
			t.Fatalf("%s %s: %d want %d", tc.method, tc.path, res.Code, tc.status)
		}
	}
}
