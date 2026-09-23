package icon

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
	DefaultEraserOrigin      = "https://storage.googleapis.com/eraser-public-assets/canvas-icons/"
	maxEraserIconBytes    = 1 << 20
	maxEraserCacheBytes   = 64 << 20
	maxEraserCacheEntries = 512
)

var (
	ErrInvalidName = errors.New("invalid Eraser icon name")
	ErrNotFound    = errors.New("Eraser icon not found")
)

type Entry struct {
	Data        []byte
	ContentType string
}

type cachedEraserIcon struct {
	slug  string
	entry Entry
}

type eraserIconFlight struct {
	done  chan struct{}
	entry Entry
	err   error
}

type EraserSource struct {
	client  *http.Client
	baseURL string

	mu         sync.Mutex
	cache      map[string]*list.Element
	cacheOrder *list.List
	cacheBytes int
	inFlight   map[string]*eraserIconFlight
}

func NewEraserSource(client *http.Client, baseURL string) *EraserSource {
	if client == nil {
		client = http.DefaultClient
	}
	return &eraserIconGateway{
		client:     client,
		baseURL:    strings.TrimRight(baseURL, "/") + "/",
		cache:      make(map[string]*list.Element),
		cacheOrder: list.New(),
		inFlight:   make(map[string]*eraserIconFlight),
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

func (g *EraserSource) cached(slug string) (Entry, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	element, ok := g.cache[slug]
	if !ok {
		return Entry{}, false
	}
	g.cacheOrder.MoveToFront(element)
	return element.Value.(cachedEraserIcon).entry, true
}

func (g *EraserSource) storeCached(slug string, entry Entry) Entry {
	g.mu.Lock()
	defer g.mu.Unlock()
	if existing, ok := g.cache[slug]; ok {
		g.cacheOrder.MoveToFront(existing)
		return existing.Value.(cachedEraserIcon).entry
	}
	element := g.cacheOrder.PushFront(cachedEraserIcon{slug: slug, entry: entry})
	g.cache[slug] = element
	g.cacheBytes += len(entry.Data)
	for g.cacheOrder.Len() > maxEraserCacheEntries || g.cacheBytes > maxEraserCacheBytes {
		oldest := g.cacheOrder.Back()
		if oldest == nil {
			break
		}
		item := oldest.Value.(cachedEraserIcon)
		delete(g.cache, item.slug)
		g.cacheBytes -= len(item.entry.Data)
		g.cacheOrder.Remove(oldest)
	}
	return entry
}

func (g *EraserSource) fetchUpstream(ctx context.Context, slug string) (Entry, error) {
	requestURL := g.baseURL + url.PathEscape(slug) + ".svg"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return Entry{}, err
	}
	response, err := g.client.Do(req)
	if err != nil {
		return Entry{}, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return Entry{}, ErrNotFound
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return Entry{}, errors.New("Eraser icon source unavailable")
	}
	mediaType, _, mediaErr := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if mediaErr != nil || mediaType != "image/svg+xml" {
		return Entry{}, ErrNotFound
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxEraserIconBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxEraserIconBytes || !validSVG(data) {
		return Entry{}, ErrNotFound
	}
	return Entry{Data: data, ContentType: "image/svg+xml"}, nil
}

func (g *EraserSource) Fetch(ctx context.Context, slug string) (Entry, error) {
	if !validEraserIconSlug(slug) {
		return Entry{}, ErrInvalidName
	}
	if entry, ok := g.cached(slug); ok {
		return entry, nil
	}

	g.mu.Lock()
	if existing, ok := g.inFlight[slug]; ok {
		g.mu.Unlock()
		select {
		case <-existing.done:
			return existing.entry, existing.err
		case <-ctx.Done():
			return Entry{}, ctx.Err()
		}
	}
	flight := &eraserIconFlight{done: make(chan struct{})}
	g.inFlight[slug] = flight
	g.mu.Unlock()

	entry, err := g.fetchUpstream(ctx, slug)
	if err == nil {
		entry = g.storeCached(slug, entry)
	}

	g.mu.Lock()
	flight.entry = entry
	flight.err = err
	delete(g.inFlight, slug)
	close(flight.done)
	g.mu.Unlock()
	return entry, err
}

