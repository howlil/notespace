package icon

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestEraserSourceFetchesValidatesAndCachesSVG(t *testing.T) {
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/aws-lambda.svg" {
			t.Fatalf("upstream path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "image/svg+xml")
		_, _ = io.WriteString(w, `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`)
	}))
	defer upstream.Close()

	source := NewEraserSource(upstream.Client(), upstream.URL)
	entry, err := source.Fetch(context.Background(), "aws-lambda")
	if err != nil {
		t.Fatal(err)
	}
	if entry.ContentType != "image/svg+xml" || !strings.Contains(string(entry.Data), "<svg") {
		t.Fatalf("entry = %#v", entry)
	}
	if _, err := source.Fetch(context.Background(), "aws-lambda"); err != nil {
		t.Fatal(err)
	}
	if requests != 1 {
		t.Fatalf("upstream requests = %d, want 1", requests)
	}
}

func TestEraserSourceRejectsInvalidOrUnsafeSVG(t *testing.T) {
	if validEraserIconSlug("../secrets") || validEraserIconSlug("aws lambda") || validEraserIconSlug("aws?lambda") {
		t.Fatal("unsafe icon slug accepted")
	}
	unsafe := []string{
		`<svg><script>alert(1)</script></svg>`,
		`<svg><path onclick="alert(1)"/></svg>`,
		`<svg><image href="https://example.com/tracker.png"/></svg>`,
		`<svg><foreignObject><div>html</div></foreignObject></svg>`,
		`<!DOCTYPE svg><svg></svg>`,
		`<html></html>`,
	}
	for _, payload := range unsafe {
		if validSVG([]byte(payload)) {
			t.Fatalf("unsafe or non-SVG payload accepted: %q", payload)
		}
	}
	if !validSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><use href="#shape"/></svg>`)) {
		t.Fatal("safe local SVG reference rejected")
	}
}

func TestEraserSourceDedupesConcurrentCacheMisses(t *testing.T) {
	var requests atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			close(started)
		}
		<-release
		w.Header().Set("Content-Type", "image/svg+xml")
		_, _ = io.WriteString(w, `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`)
	}))
	defer upstream.Close()

	source := NewEraserSource(&http.Client{Timeout: time.Second}, upstream.URL)
	var wg sync.WaitGroup
	errorsCh := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := source.Fetch(context.Background(), "aws-lambda")
			errorsCh <- err
		}()
	}
	<-started
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()
	close(errorsCh)

	for err := range errorsCh {
		if err != nil {
			t.Fatalf("fetch error = %v", err)
		}
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("upstream requests = %d, want 1", got)
	}
}


func TestEraserSourceLeaderCancellationDoesNotFailFollowers(t *testing.T) {
	var requests atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			close(started)
		}
		<-release
		w.Header().Set("Content-Type", "image/svg+xml")
		_, _ = io.WriteString(w, `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`)
	}))
	defer upstream.Close()

	source := NewEraserSource(&http.Client{Timeout: time.Second}, upstream.URL)
	leaderCtx, cancelLeader := context.WithCancel(context.Background())
	leaderResult := make(chan error, 1)
	go func() {
		_, err := source.Fetch(leaderCtx, "aws-lambda")
		leaderResult <- err
	}()
	<-started

	followerResult := make(chan error, 1)
	go func() {
		_, err := source.Fetch(context.Background(), "aws-lambda")
		followerResult <- err
	}()
	cancelLeader()
	if err := <-leaderResult; !errors.Is(err, context.Canceled) {
		t.Fatalf("leader error = %v, want context.Canceled", err)
	}
	close(release)
	if err := <-followerResult; err != nil {
		t.Fatalf("follower error = %v", err)
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("upstream requests = %d, want 1", got)
	}
}
