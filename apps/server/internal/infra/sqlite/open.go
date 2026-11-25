// Package sqlite owns SQLite connection pools, PRAGMA setup, transaction
// helpers, migration orchestration, and verified VACUUM INTO snapshots with
// zero domain knowledge.
package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/howlil/notespace/apps/server/internal/infra/sqlite/migrations"
	_ "modernc.org/sqlite"
)

const readerMaxOpenConns = 4

// PoolStats captures connection pool health for request observability.
type PoolStats struct {
	OpenConnections int
	InUse           int
	Idle            int
	WaitCount       int64
	WaitDuration    time.Duration
}

// OpenOptions configures optional startup hooks without coupling sqlite to
// higher-level domain packages.
type OpenOptions struct {
	MigrationHook func(context.Context, *sql.Tx, string) error
}

// DB owns Notespace's dual-pool SQLite handles. Write transactions serialize
// through writer (MaxOpenConns=1, BEGIN IMMEDIATE), while concurrent read
// transactions execute on reader without blocking autosave.
type DB struct {
	writer *sql.DB
	reader *sql.DB
}

func Open(ctx context.Context, path string, opts ...OpenOptions) (*DB, error) {
	var hook func(context.Context, *sql.Tx, string) error
	if len(opts) > 0 {
		hook = opts[0].MigrationHook
	}

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

	escapedPath := EscapeURIPath(filepath.ToSlash(absolute))
	writerDSN := "file:" + escapedPath + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(FULL)&_txlock=immediate"
	writer, err := sql.Open("sqlite", writerDSN)
	if err != nil {
		return nil, err
	}
	writer.SetMaxOpenConns(1)
	writer.SetMaxIdleConns(1)

	var recoveryPath string
	if err = writer.PingContext(ctx); err == nil {
		var inspection migrations.Inspection
		inspection, err = migrations.Inspect(ctx, writer)
		if err == nil && wasExisting && inspection.NeedsMigration {
			err = migrations.ValidateFull(ctx, writer)
			if err == nil {
				recoveryPath, err = snapshotBeforeMigration(ctx, writer, absolute)
			}
		}
		if err == nil {
			err = migrations.RunWithHook(ctx, writer, hook)
			if err == nil && wasExisting && inspection.NeedsMigration {
				err = migrations.ValidateFull(ctx, writer)
			}
		}
	}
	if err != nil {
		_ = writer.Close()
		if recoveryPath != "" {
			return nil, fmt.Errorf("database startup failed: %w; verified pre-upgrade snapshot retained at %s (do not replace the database while Notespace is running)", err, recoveryPath)
		}
		return nil, err
	}

	readerDSN := "file:" + escapedPath + "?mode=ro&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=query_only(1)"
	reader, err := sql.Open("sqlite", readerDSN)
	if err != nil {
		_ = writer.Close()
		return nil, err
	}
	reader.SetMaxOpenConns(readerMaxOpenConns)
	reader.SetMaxIdleConns(readerMaxOpenConns)
	if err := reader.PingContext(ctx); err != nil {
		_ = reader.Close()
		_ = writer.Close()
		return nil, err
	}

	return &DB{
		writer: writer,
		reader: reader,
	}, nil
}

func (d *DB) PoolStats() PoolStats {
	stats := d.writer.Stats()
	return PoolStats{
		OpenConnections: stats.OpenConnections,
		InUse:           stats.InUse,
		Idle:            stats.Idle,
		WaitCount:       stats.WaitCount,
		WaitDuration:    stats.WaitDuration,
	}
}

func (d *DB) Close() error {
	var readerErr error
	if d.reader != nil {
		readerErr = d.reader.Close()
	}
	writerErr := d.writer.Close()
	return errors.Join(readerErr, writerErr)
}

func (d *DB) Healthy(ctx context.Context) error {
	if err := d.writer.PingContext(ctx); err != nil {
		return err
	}
	if d.reader != nil {
		return d.reader.PingContext(ctx)
	}
	return nil
}

func (d *DB) Writer() *sql.DB {
	return d.writer
}

func (d *DB) ReadPool() *sql.DB {
	if d.reader != nil {
		return d.reader
	}
	return d.writer
}
