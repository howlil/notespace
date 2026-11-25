package eraser

import (
	"container/list"
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/howlil/notespace/apps/server/internal/domain"
)

const (
	maxEraserCacheBytes    = 64 << 20
	maxEraserCacheEntries  = 512
	defaultUpstreamTimeout = 5 * time.Second
	defaultFlightTimeout   = 10 * time.Second
)

type cachedEraserIcon struct {
	slug  string
	entry domain.IconEntry
}

type eraserIconFlight struct {
	done  chan struct{}
	entry domain.IconEntry
	err   error
}

type EraserSource struct {
	client        *http.Client
	baseURL       string
	flightTimeout time.Duration

	mu         sync.Mutex
	cache      map[string]*list.Element
	cacheOrder *list.List
	cacheBytes int
	inFlight   map[string]*eraserIconFlight
}

func NewEraserSource(client *http.Client, baseURL string) *EraserSource {
	if client == nil {
		client = &http.Client{Timeout: defaultUpstreamTimeout}
	}
	flightTimeout := defaultFlightTimeout
	if client.Timeout > 0 {
		flightTimeout = client.Timeout
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = DefaultOrigin
	}
	return &EraserSource{
		client:        client,
		baseURL:       strings.TrimRight(baseURL, "/") + "/",
		flightTimeout: flightTimeout,
		cache:         make(map[string]*list.Element),
		cacheOrder:    list.New(),
		inFlight:      make(map[string]*eraserIconFlight),
	}
}

func (g *EraserSource) cached(slug string) (domain.IconEntry, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	element, ok := g.cache[slug]
	if !ok {
		return domain.IconEntry{}, false
	}
	g.cacheOrder.MoveToFront(element)
	return element.Value.(cachedEraserIcon).entry, true
}

func (g *EraserSource) storeCached(slug string, entry domain.IconEntry) domain.IconEntry {
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

func (g *EraserSource) completeFlight(ctx context.Context, slug string, flight *eraserIconFlight) {
	flightCtx, cancel := context.WithTimeout(ctx, g.flightTimeout)
	defer cancel()

	entry, err := g.fetchUpstream(flightCtx, slug)
	if err == nil {
		entry = g.storeCached(slug, entry)
	}

	g.mu.Lock()
	flight.entry = entry
	flight.err = err
	delete(g.inFlight, slug)
	close(flight.done)
	g.mu.Unlock()
}

func (g *EraserSource) Fetch(ctx context.Context, slug string) (domain.IconEntry, error) {
	if !validEraserIconSlug(slug) {
		return domain.IconEntry{}, domain.ErrIconInvalidName
	}
	if entry, ok := g.cached(slug); ok {
		return entry, nil
	}
	if err := ctx.Err(); err != nil {
		return domain.IconEntry{}, err
	}

	g.mu.Lock()
	flight, exists := g.inFlight[slug]
	if !exists {
		flight = &eraserIconFlight{done: make(chan struct{})}
		g.inFlight[slug] = flight
		go g.completeFlight(context.WithoutCancel(ctx), slug, flight)
	}
	g.mu.Unlock()

	select {
	case <-flight.done:
		return flight.entry, flight.err
	case <-ctx.Done():
		return domain.IconEntry{}, ctx.Err()
	}
}
