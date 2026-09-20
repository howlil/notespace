package persistence

import (
	"context"
	"database/sql"
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
	dsn := filepath.ToSlash(absolute) + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(FULL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err = db.PingContext(ctx); err == nil {
		err = migrations.Run(ctx, db)
	}
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Stats() sql.DBStats                { return s.db.Stats() }
func (s *Store) Close() error                      { return s.db.Close() }
func (s *Store) Healthy(ctx context.Context) error { return s.db.PingContext(ctx) }
