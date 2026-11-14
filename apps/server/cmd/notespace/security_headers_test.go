package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestOwnerAuthUnauthorizedResponseIsNotCacheable(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := ownerAuth(next, "secret")

	for _, tc := range []struct {
		name     string
		username string
		password string
	}{
		{"missing credentials", "", ""},
		{"wrong username", "other", "secret"},
		{"wrong password", ownerUsername, "wrong"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
			if tc.username != "" || tc.password != "" {
				req.SetBasicAuth(tc.username, tc.password)
			}
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
			}
			if got := res.Header().Get("Cache-Control"); got != "no-store" {
				t.Fatalf("Cache-Control = %q", got)
			}
			if got := res.Header().Get("WWW-Authenticate"); got != `Basic realm="Notespace", charset="UTF-8"` {
				t.Fatalf("WWW-Authenticate = %q", got)
			}
		})
	}
}

func TestProductionRouteCacheAndSecurityHeaders(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("Notespace"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("console.log('ok')"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "code-runner-worker.js"), []byte("self.onmessage = () => {};"), 0600); err != nil {
		t.Fatal(err)
	}

	api := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := routes(api, dir)

	root := httptest.NewRecorder()
	handler.ServeHTTP(root, httptest.NewRequest(http.MethodGet, "/", nil))
	if root.Code != http.StatusOK {
		t.Fatalf("root status = %d", root.Code)
	}
	if got := root.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("root Cache-Control = %q", got)
	}
	if got := root.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("root X-Frame-Options = %q", got)
	}
	if got := root.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("root X-Content-Type-Options = %q", got)
	}
	if got := root.Header().Get("Referrer-Policy"); got != "same-origin" {
		t.Fatalf("root Referrer-Policy = %q", got)
	}
	if got := root.Header().Get("Content-Security-Policy"); got != defaultWebCSP {
		t.Fatalf("root Content-Security-Policy = %q", got)
	}

	apiRes := httptest.NewRecorder()
	handler.ServeHTTP(apiRes, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if apiRes.Code != http.StatusOK {
		t.Fatalf("api status = %d", apiRes.Code)
	}
	if got := apiRes.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("api X-Frame-Options = %q", got)
	}
	if got := apiRes.Header().Get("Content-Security-Policy"); got != defaultWebCSP {
		t.Fatalf("api Content-Security-Policy = %q", got)
	}

	asset := httptest.NewRecorder()
	handler.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if asset.Code != http.StatusOK {
		t.Fatalf("asset status = %d", asset.Code)
	}
	if got := asset.Header().Get("Cache-Control"); got != "public,max-age=31536000,immutable" {
		t.Fatalf("asset Cache-Control = %q", got)
	}
	if got := asset.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("asset X-Frame-Options = %q", got)
	}
	if got := asset.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("asset X-Content-Type-Options = %q", got)
	}
	if got := asset.Header().Get("Referrer-Policy"); got != "same-origin" {
		t.Fatalf("asset Referrer-Policy = %q", got)
	}

	worker := httptest.NewRecorder()
	workerReq := httptest.NewRequest(http.MethodGet, "/code-runner-worker.js", nil)
	workerReq.Header.Set("Sec-Fetch-Dest", "worker")
	handler.ServeHTTP(worker, workerReq)
	if worker.Code != http.StatusOK {
		t.Fatalf("worker status = %d", worker.Code)
	}
	if got := worker.Header().Get("Content-Security-Policy"); got != codeRunnerWorkerCSP {
		t.Fatalf("worker Content-Security-Policy = %q", got)
	}

	nonWorker := httptest.NewRecorder()
	nonWorkerReq := httptest.NewRequest(http.MethodGet, "/code-runner-worker.js", nil)
	nonWorkerReq.Header.Set("Sec-Fetch-Dest", "document")
	handler.ServeHTTP(nonWorker, nonWorkerReq)
	if nonWorker.Code != http.StatusNotFound {
		t.Fatalf("non-worker status = %d, want %d", nonWorker.Code, http.StatusNotFound)
	}

	iframeReq := httptest.NewRequest(http.MethodGet, "/", nil)
	iframeReq.Header.Set("Sec-Fetch-Mode", "navigate")
	iframeReq.Header.Set("Sec-Fetch-Dest", "iframe")
	iframeRes := httptest.NewRecorder()
	handler.ServeHTTP(iframeRes, iframeReq)
	if iframeRes.Code != http.StatusForbidden {
		t.Fatalf("iframe navigate status = %d, want %d", iframeRes.Code, http.StatusForbidden)
	}

	desktopHandler := desktopLoopbackBoundary(handler, "127.0.0.1:8080")
	desktopRoot := httptest.NewRecorder()
	desktopHandler.ServeHTTP(desktopRoot, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/", nil))
	if desktopRoot.Code != http.StatusOK {
		t.Fatalf("desktop status = %d", desktopRoot.Code)
	}
	if got := desktopRoot.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Fatalf("desktop Referrer-Policy = %q, want no-referrer", got)
	}
}
