// Package paging owns the ephemeral in-memory cursor-snapshot cache used to
// keep workspace library traversals stable across concurrent mutations.
package paging

import (
	"crypto/rand"
	"sync"
	"time"

	"github.com/howlil/notespace/apps/server/internal/domain"
)

const (
	SnapshotLifetime = 10 * time.Minute
	MaxSnapshots     = 8
	MaxSnapshotRows  = 20000
)

type key struct {
	categoryID string
	query      string
	sort       string
	hasCanvas  bool
}

type session struct {
	key       key
	items     []domain.WorkspaceSummary
	expiresAt time.Time
}

// Cache owns ephemeral workspace pagination snapshot sessions in-process with
// an injectable clock.
type Cache struct {
	mu       sync.Mutex
	now      func() time.Time
	sessions map[string]session
}

func New(clock func() time.Time) *Cache {
	if clock == nil {
		clock = time.Now
	}
	return &Cache{
		now:      clock,
		sessions: make(map[string]session),
	}
}

func (c *Cache) SetClock(clock func() time.Time) {
	if clock == nil {
		clock = time.Now
	}
	c.mu.Lock()
	c.now = clock
	c.mu.Unlock()
}

func keyFor(query domain.WorkspaceQuery) key {
	return key{
		categoryID: query.CategoryID,
		query:      query.Query,
		sort:       query.Sort,
		hasCanvas:  query.HasCanvas,
	}
}

func slicePage(items []domain.WorkspaceSummary, token string, query domain.WorkspaceQuery) domain.WorkspacePage {
	offset := min(query.Offset, len(items))
	end := min(offset+query.Limit, len(items))
	page := domain.WorkspacePage{
		Items:    append([]domain.WorkspaceSummary{}, items[offset:end]...),
		Total:    len(items),
		Offset:   query.Offset,
		Limit:    query.Limit,
		Snapshot: token,
	}
	if end < len(items) {
		next := end
		page.NextOffset = &next
	}
	return page
}

func (c *Cache) Read(query domain.WorkspaceQuery) (domain.WorkspacePage, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	s, ok := c.sessions[query.Snapshot]
	if !ok || !now.Before(s.expiresAt) {
		delete(c.sessions, query.Snapshot)
		return domain.WorkspacePage{}, domain.ErrWorkspaceConflict
	}
	if s.key != keyFor(query) {
		return domain.WorkspacePage{}, domain.ErrWorkspaceInvalid
	}
	return slicePage(s.items, query.Snapshot, query), nil
}

func (c *Cache) Start(query domain.WorkspaceQuery, items []domain.WorkspaceSummary) (domain.WorkspacePage, error) {
	if len(items) > MaxSnapshotRows {
		return domain.WorkspacePage{}, domain.ErrWorkspaceInvalid
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	for id, s := range c.sessions {
		if !now.Before(s.expiresAt) {
			delete(c.sessions, id)
		}
	}
	if len(c.sessions) >= MaxSnapshots {
		var oldestID string
		var oldest time.Time
		for id, s := range c.sessions {
			if oldestID == "" || s.expiresAt.Before(oldest) {
				oldestID, oldest = id, s.expiresAt
			}
		}
		delete(c.sessions, oldestID)
	}
	token := rand.Text()
	c.sessions[token] = session{
		key:       keyFor(query),
		items:     items,
		expiresAt: now.Add(SnapshotLifetime),
	}
	return slicePage(items, token, query), nil
}

func (c *Cache) Invalidate() {
	c.mu.Lock()
	clear(c.sessions)
	c.mu.Unlock()
}
