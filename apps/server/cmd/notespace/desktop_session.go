package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"sync/atomic"
)

// desktopSession uses independent unpredictable values for single-use WebView
// bootstrap and subsequent HttpOnly same-origin API authentication.
type desktopSession struct {
	bootstrap string
	cookie    string
	consumed  atomic.Bool
}

func newDesktopSession() (*desktopSession, error) {
	newSecret := func() (string, error) {
		var bytes [32]byte
		if _, err := rand.Read(bytes[:]); err != nil { return "", fmt.Errorf("desktop session entropy unavailable: %w", err) }
		return hex.EncodeToString(bytes[:]), nil
	}
	bootstrap, err := newSecret()
	if err != nil { return nil, err }
	cookie, err := newSecret()
	if err != nil { return nil, err }
	return &desktopSession{bootstrap:bootstrap, cookie:cookie}, nil
}

func (s *desktopSession) handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/__desktop_session" {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Referrer-Policy", "no-referrer")
			if r.Method != http.MethodGet || !s.validBootstrap(r.URL.Query().Get("code")) {
				http.Error(w, "Desktop bootstrap unavailable", http.StatusForbidden)
				return
			}
			// No JavaScript can read this cookie. Another process must possess
			// the random session cookie to call private API routes.
			http.SetCookie(w, &http.Cookie{
				Name: "notespace_desktop", Value: s.cookie, Path: "/",
				HttpOnly: true, SameSite: http.SameSiteStrictMode,
			})
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		if len(r.URL.Path) >= 5 && r.URL.Path[:5] == "/api/" {
			cookie, err := r.Cookie("notespace_desktop")
			if err != nil || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(s.cookie)) != 1 {
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "Desktop session required", http.StatusUnauthorized)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *desktopSession) validBootstrap(supplied string) bool {
	if subtle.ConstantTimeCompare([]byte(s.bootstrap), []byte(supplied)) != 1 {
		return false
	}
	return s.consumed.CompareAndSwap(false, true)
}
