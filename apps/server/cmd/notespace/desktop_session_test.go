package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDesktopSessionPreventsUnauthenticatedLocalAPI(t *testing.T) {
	session, err := newDesktopSession()
	if err != nil {
		t.Fatal(err)
	}
	api := session.handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	request := func(path string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:49201"+path, nil)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		return w
	}
	for _, path := range []string{"/api/workspaces", "/api/backup/restore", "/api/activity/sessions"} {
		w := request(path, nil)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s without cookie returned %d", path, w.Code)
		}
	}
	if w := request("/__desktop_session?code=wrong", nil); w.Code != http.StatusForbidden {
		t.Fatalf("wrong code accepted: %d", w.Code)
	}
	redirect := request("/__desktop_session?code="+session.bootstrap, nil)
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
	if w := request("/__desktop_session?code="+session.bootstrap, nil); w.Code != http.StatusForbidden {
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

func TestDesktopSessionEnforcesHostAndOriginAheadOfBootstrap(t *testing.T) {
	session, err := newDesktopSession()
	if err != nil {
		t.Fatal(err)
	}
	wrapped := desktopLoopbackBoundary(session.handler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })), "127.0.0.1:49201")
	path := "/__desktop_session?code=" + session.bootstrap
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:49201"+path, nil)
	req.Host = "evil.local:49201"
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("bad Host accepted: %d", rr.Code)
	}
	req.Host = "127.0.0.1:49201"
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	rr = httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)
	if rr.Code != http.StatusSeeOther {
		t.Fatalf("valid bootstrap rejected: %d", rr.Code)
	}
}
