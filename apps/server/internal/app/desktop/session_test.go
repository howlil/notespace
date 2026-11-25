package desktop

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDesktopSidecarSessionPreventsUnauthenticatedLocalAPI(t *testing.T) {
	sidecar, err := Start(context.Background(), Options{
		OriginFile: filepath.Join(t.TempDir(), "origin-port"),
		Inner: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}),
	})
	if err != nil {
		t.Fatal(err)
	}
	defer sidecar.Close()

	readyURL, err := url.Parse(sidecar.ReadyURL)
	if err != nil {
		t.Fatal(err)
	}
	baseURL := "http://" + readyURL.Host
	request := func(path string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, baseURL+path, nil)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		sidecar.Handler.ServeHTTP(w, r)
		return w
	}

	for _, path := range []string{"/api/workspaces", "/api/backup/restore", "/api/activity/sessions"} {
		w := request(path, nil)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s without cookie returned %d", path, w.Code)
		}
	}
	if w := request(sessionPath+"?code=wrong", nil); w.Code != http.StatusForbidden {
		t.Fatalf("wrong code accepted: %d", w.Code)
	}
	redirect := request(readyURL.RequestURI(), nil)
	if redirect.Code != http.StatusSeeOther {
		t.Fatalf("bootstrap failure: %d", redirect.Code)
	}
	cookies := redirect.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatalf("bootstrap cookie missing HttpOnly or SameSite=Strict: %v", cookies)
	}
	if strings.Contains(redirect.Header().Get("Location"), "code") {
		t.Fatal("redirect leaks token")
	}
	if w := request(readyURL.RequestURI(), nil); w.Code != http.StatusForbidden {
		t.Fatalf("bootstrap token reused: %d", w.Code)
	}
	if w := request("/api/workspaces", cookies[0]); w.Code != http.StatusNoContent {
		t.Fatalf("cookie rejected: %d", w.Code)
	}
	fake := *cookies[0]
	fake.Value = strings.Repeat("f", 64)
	if w := request("/api/workspaces", &fake); w.Code != http.StatusUnauthorized {
		t.Fatalf("forged cookie accepted: %d", w.Code)
	}
}

func TestDesktopSidecarEnforcesHostAndOriginAheadOfBootstrap(t *testing.T) {
	sidecar, err := Start(context.Background(), Options{
		OriginFile: filepath.Join(t.TempDir(), "origin-port"),
		Inner: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}),
	})
	if err != nil {
		t.Fatal(err)
	}
	defer sidecar.Close()

	readyURL, err := url.Parse(sidecar.ReadyURL)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, sidecar.ReadyURL, nil)
	req.Host = "evil.local:" + readyURL.Port()
	rr := httptest.NewRecorder()
	sidecar.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("bad Host accepted: %d", rr.Code)
	}

	req.Host = readyURL.Host
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	rr = httptest.NewRecorder()
	sidecar.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusSeeOther {
		t.Fatalf("valid bootstrap rejected: %d", rr.Code)
	}
}

func TestDesktopSidecarTriggersShutdownWhenParentStdinCloses(t *testing.T) {
	pr, pw := io.Pipe()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sidecar, err := Start(ctx, Options{
		OriginFile: filepath.Join(t.TempDir(), "origin-port"),
		Inner: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}),
		Stdin:      pr,
		OnShutdown: cancel,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer sidecar.Close()

	_ = pw.Close()
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("closing parent stdin did not trigger shutdown callback")
	}
}

func TestDesktopStartRequiresInnerHandler(t *testing.T) {
	if _, err := Start(context.Background(), Options{OriginFile: filepath.Join(t.TempDir(), "origin-port")}); err == nil {
		t.Fatal("expected error when Inner handler is nil")
	}
}
