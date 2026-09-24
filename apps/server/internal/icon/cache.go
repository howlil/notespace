package icon

import (
	"container/list"
	"context"
	"net/http"
	"strings"
	"sync"
)

const (
	maxEraserCacheBytes   = 64 << 20
	maxEraserCacheEntries = 512
)

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
	if strings.TrimSpace(baseURL) == "" {
		baseURL = DefaultEraserOrigin
	}
	return &EraserSource{
		client:     client,
		baseURL:    strings.TrimRight(baseURL, "/") + "/",
		cache:      make(map[string]*list.Element),
		cacheOrder: list.New(),
		inFlight:   make(map[string]*eraserIconFlight),
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
