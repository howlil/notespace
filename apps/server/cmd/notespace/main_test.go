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
	handler := routes(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" || r.URL.Path == "/api/projects/example" {
			w.WriteHeader(204)
			return
		}
		http.NotFound(w, r)
	}), dir)
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/", 200},
		{"GET", "/categories/test", 200},
		{"GET", "/workspaces/test", 200},
		{"GET", "/projects/example", 200},
		{"GET", "/assets/nonexistent.js", 404},
		{"GET", "/api/nonexistent", 404},
		{"GET", "/nonexistent", 404},
		{"GET", "/categories/test/extra", 404},
		{"PATCH", "/api/projects/example", 204},
		{"GET", "/api/health", 204},
		{"POST", "/", 405},
	} {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(tc.method, tc.path, nil))
		if res.Code != tc.status {
			t.Fatalf("%s %s: %d want %d", tc.method, tc.path, res.Code, tc.status)
		}
	}
}
