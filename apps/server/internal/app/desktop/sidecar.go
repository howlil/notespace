// Package desktop is the deep local Tauri sidecar module. It owns pinned
// loopback binding, single-use WebView bootstrap sessions, ordered Host/Origin
// and security-header enforcement, and parent stdin lifecycle supervision.
package desktop

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
)

const (
	sessionPath       = "/__desktop_session"
	sessionCookieName = "notespace_desktop"
)

// Options configures a running desktop sidecar instance.
type Options struct {
	OriginFile string
	Inner      http.Handler
	Stdin      io.Reader
	OnShutdown context.CancelFunc
}

// Sidecar represents an active pinned loopback listener paired with its
// ordered security/session handler and single-use bootstrap URL.
type Sidecar struct {
	Listener net.Listener
	Handler  http.Handler
	ReadyURL string
}

// Start binds the pinned loopback origin, constructs the one-time bootstrap
// session, composes loopback + session guards in the required order, and
// optionally supervises the parent stdin channel.
func Start(ctx context.Context, opts Options) (*Sidecar, error) {
	if opts.Inner == nil {
		return nil, fmt.Errorf("desktop sidecar requires an inner handler")
	}
	listener, err := listen(ctx, opts.OriginFile)
	if err != nil {
		return nil, err
	}
	session, err := newSession()
	if err != nil {
		_ = listener.Close()
		return nil, err
	}
	actualAddress := listener.Addr().String()
	handler := wrapLoopback(session.wrap(opts.Inner), actualAddress)
	readyURL := fmt.Sprintf("http://%s%s?code=%s", actualAddress, sessionPath, session.bootstrap)
	if opts.Stdin != nil && opts.OnShutdown != nil {
		go watchParentLifecycle(opts.Stdin, opts.OnShutdown)
	}
	return &Sidecar{
		Listener: listener,
		Handler:  handler,
		ReadyURL: readyURL,
	}, nil
}

func (s *Sidecar) Close() error {
	if s == nil || s.Listener == nil {
		return nil
	}
	return s.Listener.Close()
}
