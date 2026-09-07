package migrations

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"
	"time"
)

//go:embed *.sql
var files embed.FS

type queryContext interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func checksum(contents []byte) string {
	digest := sha256.Sum256(contents)
	return hex.EncodeToString(digest[:])
}

func ensureMetadata(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT)`); err != nil {
		return err
	}
	for _, column := range []string{"checksum", "applied_at"} {
		var count int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('schema_migrations') WHERE name=?`, column).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			if _, err := db.ExecContext(ctx, `ALTER TABLE schema_migrations ADD COLUMN `+column+` TEXT`); err != nil {
				return err
			}
		}
	}
	_, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
	return err
}

func schemaFingerprint(ctx context.Context, q queryContext) (string, error) {
	rows, err := q.QueryContext(ctx, `SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var canonical strings.Builder
	for rows.Next() {
		var kind, name, table, statement string
		if err := rows.Scan(&kind, &name, &table, &statement); err != nil {
			return "", err
		}
		fmt.Fprintf(&canonical, "%s\x00%s\x00%s\x00%s\n", kind, name, table, statement)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	return checksum([]byte(canonical.String())), nil
}

func verifyStoredFingerprint(ctx context.Context, db *sql.DB) error {
	var stored string
	err := db.QueryRowContext(ctx, `SELECT value FROM schema_state WHERE key='schema_fingerprint'`).Scan(&stored)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	current, err := schemaFingerprint(ctx, db)
	if err != nil {
		return err
	}
	if current != stored {
		return fmt.Errorf("schema drift detected: stored fingerprint %s, current %s", stored, current)
	}
	return nil
}

// Validate checks physical SQLite integrity. It accepts both *sql.DB and *sql.Tx,
// so restore can validate the replacement library before committing it.
func Validate(ctx context.Context, q queryContext) error {
	rows, err := q.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return fmt.Errorf("foreign key check: %w", err)
	}
	if rows.Next() {
		var table, parent string
		var rowID sql.NullInt64
		var fkID int
		if err := rows.Scan(&table, &rowID, &parent, &fkID); err != nil {
			rows.Close()
			return fmt.Errorf("foreign key check: %w", err)
		}
		rows.Close()
		return fmt.Errorf("foreign key violation: table=%s rowid=%v parent=%s fk=%d", table, rowID, parent, fkID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("foreign key check: %w", err)
	}
	rows.Close()

	rows, err = q.QueryContext(ctx, `PRAGMA quick_check`)
	if err != nil {
		return fmt.Errorf("quick check: %w", err)
	}
	defer rows.Close()
	seen := false
	for rows.Next() {
		seen = true
		var result string
		if err := rows.Scan(&result); err != nil {
			return fmt.Errorf("quick check: %w", err)
		}
		if result != "ok" {
			return fmt.Errorf("quick check failed: %s", result)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("quick check: %w", err)
	}
	if !seen {
		return errors.New("quick check returned no result")
	}
	return nil
}

func Run(ctx context.Context, db *sql.DB) error {
	if err := ensureMetadata(ctx, db); err != nil {
		return err
	}
	if err := verifyStoredFingerprint(ctx, db); err != nil {
		return err
	}

	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		contents, err := files.ReadFile(name)
		if err != nil {
			return err
		}
		wantChecksum := checksum(contents)
		var recorded sql.NullString
		err = db.QueryRowContext(ctx, `SELECT checksum FROM schema_migrations WHERE name=?`, name).Scan(&recorded)
		switch {
		case err == nil:
			if recorded.Valid && recorded.String != "" && recorded.String != wantChecksum {
				return fmt.Errorf("migration %s checksum changed: recorded %s, embedded %s", name, recorded.String, wantChecksum)
			}
			if !recorded.Valid || recorded.String == "" {
				if _, err := db.ExecContext(ctx, `UPDATE schema_migrations SET checksum=?,applied_at=COALESCE(applied_at,?) WHERE name=?`, wantChecksum, time.Now().UTC().Format(time.RFC3339Nano), name); err != nil {
					return err
				}
			}
			continue
		case !errors.Is(err, sql.ErrNoRows):
			return err
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, string(contents)); err == nil {
			_, err = tx.ExecContext(ctx, `INSERT INTO schema_migrations(name,checksum,applied_at) VALUES (?,?,?)`, name, wantChecksum, time.Now().UTC().Format(time.RFC3339Nano))
		}
		if err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		slog.Info("migration applied", "name", name)
	}

	if err := Validate(ctx, db); err != nil {
		return err
	}
	fingerprint, err := schemaFingerprint(ctx, db)
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `INSERT INTO schema_state(key,value) VALUES ('schema_fingerprint',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, fingerprint)
	return err
}
