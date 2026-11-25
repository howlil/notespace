package desktop

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"sync/atomic"
)

type session struct {
	bootstrap string
	cookie    string
	consumed  atomic.Bool
}

func newSession() (*session, error) {
	newSecret := func() (string, error) {
		var bytes [32]byte
		if _, err := rand.Read(bytes[:]); err != nil {
			return "", fmt.Errorf("desktop session entropy unavailable: %w", err)
		}
		return hex.EncodeToString(bytes[:]), nil
	}
	bootstrap, err := newSecret()
	if err != nil {
		return nil, err
	}
	cookie, err := newSecret()
	if err != nil {
		return nil, err
	}
	return &session{bootstrap: bootstrap, cookie: cookie}, nil
}

func (s *session) wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == sessionPath {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Referrer-Policy", "no-referrer")
			if r.Method != http.MethodGet || !s.validBootstrap(r.URL.Query().Get("code")) {
				http.Error(w, "Desktop bootstrap unavailable", http.StatusForbidden)
				return
			}
			http.SetCookie(w, &http.Cookie{
				Name: sessionCookieName, Value: s.cookie, Path: "/",
				HttpOnly: true, SameSite: http.SameSiteStrictMode,
			})
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		if len(r.URL.Path) >= 5 && r.URL.Path[:5] == "/api/" {
			cookie, err := r.Cookie(sessionCookieName)
			if err != nil || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(s.cookie)) != 1 {
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "Desktop session required", http.StatusUnauthorized)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *session) validBootstrap(supplied string) bool {
	if subtle.ConstantTimeCompare([]byte(s.bootstrap), []byte(supplied)) != 1 {
		return false
	}
	return s.consumed.CompareAndSwap(false, true)
}
