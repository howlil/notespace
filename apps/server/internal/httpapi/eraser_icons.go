package httpapi

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
)

const (
	eraserIconOrigin   = "https://storage.googleapis.com/eraser-public-assets/canvas-icons/"
	maxEraserIconBytes = 1 << 20
)

var errInvalidEraserIcon = errors.New("invalid Eraser icon")

type eraserIconCacheEntry struct {
	data        []byte
	contentType string
}

type eraserIconGateway struct {
	client  *http.Client
	baseURL string

	mu    sync.RWMutex
	cache map[string]eraserIconCacheEntry
}

func newEraserIconGateway(client *http.Client, baseURL string) *eraserIconGateway {
	if client == nil {
		client = http.DefaultClient
	}
	return &eraserIconGateway{client: client, baseURL: strings.TrimRight(baseURL, "/") + "/", cache: make(map[string]eraserIconCacheEntry)}
}

func validEraserIconSlug(slug string) bool {
	if slug == "" || len(slug) > 200 {
		return false
	}
	for _, char := range slug {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') || strings.ContainsRune("-_.+&()", char) {
			continue
		}
		return false
	}
	return true
}

func validSVG(data []byte) bool {
	text := strings.ToLower(string(data))
	if !strings.Contains(text, "<svg") || strings.Contains(text, "<script") ||
		strings.Contains(text, "javascript:") || strings.Contains(text, " onload=") ||
		strings.Contains(text, " onerror=") {
		return false
	}
	return true
}

func (g *eraserIconGateway) fetch(ctx context.Context, slug string) (eraserIconCacheEntry, error) {
	g.mu.RLock()
	entry, ok := g.cache[slug]
	g.mu.RUnlock()
	if ok {
		return entry, nil
	}

	requestURL := g.baseURL + url.PathEscape(slug) + ".svg"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return eraserIconCacheEntry{}, err
	}
	response, err := g.client.Do(req)
	if err != nil {
		return eraserIconCacheEntry{}, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return eraserIconCacheEntry{}, errInvalidEraserIcon
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return eraserIconCacheEntry{}, errors.New("Eraser icon source unavailable")
	}
	mediaType, _, mediaErr := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if mediaErr != nil || mediaType != "image/svg+xml" {
		return eraserIconCacheEntry{}, errInvalidEraserIcon
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxEraserIconBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxEraserIconBytes || !validSVG(data) {
		return eraserIconCacheEntry{}, errInvalidEraserIcon
	}
	entry = eraserIconCacheEntry{data: data, contentType: "image/svg+xml"}

	g.mu.Lock()
	if cached, alreadyCached := g.cache[slug]; alreadyCached {
		entry = cached
	} else {
		g.cache[slug] = entry
	}
	g.mu.Unlock()
	return entry, nil
}

func (g *eraserIconGateway) serve(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !validEraserIconSlug(slug) {
		send(w, http.StatusBadRequest, map[string]string{"error": "Invalid Eraser icon name"})
		return
	}
	entry, err := g.fetch(r.Context(), slug)
	if errors.Is(err, errInvalidEraserIcon) {
		send(w, http.StatusNotFound, map[string]string{"error": "Eraser icon not found"})
		return
	}
	if err != nil {
		send(w, http.StatusBadGateway, map[string]string{"error": "Could not load Eraser icon"})
		return
	}
	w.Header().Set("Content-Type", entry.contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(entry.data)))
	w.Header().Set("Cache-Control", "public,max-age=86400,immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method != http.MethodHead {
		_, _ = w.Write(entry.data)
	}
}
