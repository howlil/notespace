package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"github.com/howlil/notespace/apps/server/migrations"
	_ "modernc.org/sqlite"
)

type Store struct{ db *sql.DB }

func Open(ctx context.Context, path string) (*Store, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(absolute), 0700); err != nil {
		return nil, err
	}
	_, statErr := os.Stat(absolute)
	wasExisting := statErr == nil
	if statErr != nil && !os.IsNotExist(statErr) {
		return nil, fmt.Errorf("inspect SQLite database path: %w", statErr)
	}
	dsn := filepath.ToSlash(absolute) + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(FULL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	var recoveryPath string
	if err = db.PingContext(ctx); err == nil {
		var inspection migrations.Inspection
		inspection, err = migrations.Inspect(ctx, db)
		if err == nil && wasExisting && inspection.NeedsMigration {
			// Refuse upgrades if the source is already damaged. No migration may
			// run unless a complete, verified recovery copy is on disk.
			err = migrations.Validate(ctx, db)
			if err == nil {
				recoveryPath, err = snapshotBeforeMigration(ctx, db, absolute)
			}
		}
		if err == nil {
			err = migrations.Run(ctx, db)
		}
	}
	if err != nil {
		_ = db.Close()
		if recoveryPath != "" {
			return nil, fmt.Errorf("database startup failed: %w; verified pre-upgrade snapshot retained at %s (do not replace the database while Notespace is running)", err, recoveryPath)
		}
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Stats() sql.DBStats                { return s.db.Stats() }
func (s *Store) Close() error                      { return s.db.Close() }
func (s *Store) Healthy(ctx context.Context) error { return s.db.PingContext(ctx) }
