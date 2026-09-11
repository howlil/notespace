package httpapi

import (
	"container/list"
	"context"
	"encoding/xml"
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
	eraserIconOrigin       = "https://storage.googleapis.com/eraser-public-assets/canvas-icons/"
	maxEraserIconBytes     = 1 << 20
	maxEraserCacheBytes    = 64 << 20
	maxEraserCacheEntries  = 512
)

var errInvalidEraserIcon = errors.New("invalid Eraser icon")

type eraserIconCacheEntry struct {
	data        []byte
	contentType string
}

type cachedEraserIcon struct {
	slug  string
	entry eraserIconCacheEntry
}

type eraserIconGateway struct {
	client  *http.Client
	baseURL string

	mu         sync.Mutex
	cache      map[string]*list.Element
	cacheOrder *list.List
	cacheBytes int
}

func newEraserIconGateway(client *http.Client, baseURL string) *eraserIconGateway {
	if client == nil {
		client = http.DefaultClient
	}
	return &eraserIconGateway{
		client: client,
		baseURL: strings.TrimRight(baseURL, "/") + "/",
		cache: make(map[string]*list.Element),
		cacheOrder: list.New(),
	}
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

func unsafeSVGURL(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || strings.HasPrefix(value, "#") || strings.HasPrefix(value, "data:image/") {
		return false
	}
	return strings.Contains(value, ":") || strings.HasPrefix(value, "//")
}

func validSVG(data []byte) bool {
	decoder := xml.NewDecoder(strings.NewReader(string(data)))
	seenSVG := false
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return seenSVG
		}
		if err != nil {
			return false
		}
		switch typed := token.(type) {
		case xml.Directive:
			if strings.Contains(strings.ToLower(string(typed)), "doctype") {
				return false
			}
		case xml.StartElement:
			name := strings.ToLower(typed.Name.Local)
			if name == "svg" {
				seenSVG = true
			}
			switch name {
			case "script", "foreignobject", "iframe", "object", "embed":
				return false
			}
			for _, attr := range typed.Attr {
				attrName := strings.ToLower(attr.Name.Local)
				value := strings.TrimSpace(attr.Value)
				lowerValue := strings.ToLower(value)
				if strings.HasPrefix(attrName, "on") || attrName == "base" || strings.Contains(lowerValue, "javascript:") {
					return false
				}
				if attrName == "href" && unsafeSVGURL(value) {
					return false
				}
				if attrName == "style" && (strings.Contains(lowerValue, "javascript:") || strings.Contains(lowerValue, "url(http") || strings.Contains(lowerValue, "url(//")) {
					return false
				}
			}
		}
	}
}

func (g *eraserIconGateway) cached(slug string) (eraserIconCacheEntry, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	element, ok := g.cache[slug]
	if !ok {
		return eraserIconCacheEntry{}, false
	}
	g.cacheOrder.MoveToFront(element)
	return element.Value.(cachedEraserIcon).entry, true
}

func (g *eraserIconGateway) storeCached(slug string, entry eraserIconCacheEntry) eraserIconCacheEntry {
	g.mu.Lock()
	defer g.mu.Unlock()
	if existing, ok := g.cache[slug]; ok {
		g.cacheOrder.MoveToFront(existing)
		return existing.Value.(cachedEraserIcon).entry
	}
	element := g.cacheOrder.PushFront(cachedEraserIcon{slug: slug, entry: entry})
	g.cache[slug] = element
	g.cacheBytes += len(entry.data)
	for g.cacheOrder.Len() > maxEraserCacheEntries || g.cacheBytes > maxEraserCacheBytes {
		oldest := g.cacheOrder.Back()
		if oldest == nil {
			break
		}
		item := oldest.Value.(cachedEraserIcon)
		delete(g.cache, item.slug)
		g.cacheBytes -= len(item.entry.data)
		g.cacheOrder.Remove(oldest)
	}
	return entry
}

func (g *eraserIconGateway) fetch(ctx context.Context, slug string) (eraserIconCacheEntry, error) {
	if entry, ok := g.cached(slug); ok {
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
	entry := eraserIconCacheEntry{data: data, contentType: "image/svg+xml"}
	return g.storeCached(slug, entry), nil
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
