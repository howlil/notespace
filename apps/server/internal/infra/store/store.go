// Package library coordinates Notespace's transactional SQLite persistence
// across Categories, Workspaces, Canvas scenes, Notes, Placements, Assets,
// Trash, FTS5 Search, and portable Backups.
package store

import (
	"context"
	"time"

	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
	"github.com/howlil/notespace/apps/server/internal/infra/store/paging"
)

// Store is the single transactional persistence coordinator composing Notespace's
// dual-pool SQLite handle and ephemeral workspace pagination snapshot cache.
type Store struct {
	db         *sqlite.DB
	pagination *paging.Cache
}

func Open(ctx context.Context, path string) (*Store, error) {
	db, err := sqlite.Open(ctx, path, sqlite.OpenOptions{
		MigrationHook: scrubRetiredNoteArtifactsTx,
	})
	if err != nil {
		return nil, err
	}
	return &Store{
		db:         db,
		pagination: paging.New(time.Now),
	}, nil
}

func (s *Store) PoolStats() sqlite.PoolStats {
	return s.db.PoolStats()
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Healthy(ctx context.Context) error {
	return s.db.Healthy(ctx)
}
