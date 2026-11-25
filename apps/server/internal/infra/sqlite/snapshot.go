package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/howlil/notespace/apps/server/internal/infra/sqlite/migrations"
)

// CreateManualSnapshot creates a verified, independent, consistent SQLite
// recovery copy without modifying or reopening the canonical database for writes.
func CreateManualSnapshot(ctx context.Context, source string) (string, error) {
	absolute, err := filepath.Abs(source)
	if err != nil {
		return "", err
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return "", fmt.Errorf("open source library: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("source library is not a regular SQLite file")
	}
	dir := absolute + ".backups"
	if err := ensureSnapshotDir(dir); err != nil {
		return "", err
	}

	db, err := sql.Open("sqlite", "file:"+EscapeURIPath(filepath.ToSlash(absolute))+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return "", fmt.Errorf("open library read only: %w", err)
	}
	db.SetMaxOpenConns(1)
	if err := migrations.ValidateFull(ctx, db); err != nil {
		_ = db.Close()
		return "", fmt.Errorf("source library failed integrity validation: %w", err)
	}
	output, err := vacuumAndPublishSnapshot(ctx, db, dir, "manual")
	closeErr := db.Close()
	if err != nil {
		return "", err
	}
	if closeErr != nil {
		return "", fmt.Errorf("close read-only library: %w", closeErr)
	}
	return output, nil
}

func snapshotBeforeMigration(ctx context.Context, db *sql.DB, databasePath string) (string, error) {
	dir := databasePath + ".recovery"
	if err := ensureSnapshotDir(dir); err != nil {
		return "", err
	}
	final, err := vacuumAndPublishSnapshot(ctx, db, dir, "pre-migration")
	if err != nil {
		return "", err
	}
	slog.Info("verified pre-migration recovery snapshot created", "path", final)
	return final, nil
}

func ensureSnapshotDir(dir string) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create snapshot directory: %w", err)
	}
	info, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("snapshot path is not a real directory: %s", dir)
	}
	return nil
}

func vacuumAndPublishSnapshot(ctx context.Context, db *sql.DB, dir, prefix string) (string, error) {
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return "", fmt.Errorf("create snapshot identifier: %w", err)
	}
	name := fmt.Sprintf("%s-%s-%s.db", prefix, time.Now().UTC().Format("20060102T150405.000000000Z"), hex.EncodeToString(suffix[:]))
	partial := filepath.Join(dir, "."+name+".partial")
	final := filepath.Join(dir, name)
	defer func() { _ = os.Remove(partial) }()

	if _, err := db.ExecContext(ctx, `VACUUM INTO ?`, partial); err != nil {
		return "", fmt.Errorf("create SQLite snapshot: %w", err)
	}
	if err := os.Chmod(partial, 0600); err != nil {
		return "", fmt.Errorf("protect snapshot permissions: %w", err)
	}

	snapshot, err := sql.Open("sqlite", "file:"+EscapeURIPath(filepath.ToSlash(partial))+"?mode=ro&_pragma=foreign_keys(1)")
	if err != nil {
		return "", err
	}
	snapshot.SetMaxOpenConns(1)
	validationErr := migrations.ValidateFull(ctx, snapshot)
	closeErr := snapshot.Close()
	if validationErr != nil {
		return "", fmt.Errorf("validate snapshot: %w", validationErr)
	}
	if closeErr != nil {
		return "", fmt.Errorf("close snapshot: %w", closeErr)
	}

	file, err := os.OpenFile(partial, os.O_RDWR, 0)
	if err != nil {
		return "", err
	}
	syncErr := file.Sync()
	closeErr = file.Close()
	if syncErr != nil {
		return "", fmt.Errorf("sync snapshot: %w", syncErr)
	}
	if closeErr != nil {
		return "", closeErr
	}
	if err := os.Rename(partial, final); err != nil {
		return "", fmt.Errorf("publish snapshot: %w", err)
	}
	if runtime.GOOS != "windows" {
		folder, err := os.Open(dir)
		if err != nil {
			return "", err
		}
		syncErr = folder.Sync()
		closeErr = folder.Close()
		if syncErr != nil {
			return "", fmt.Errorf("sync snapshot directory (snapshot is at %s): %w", final, syncErr)
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	return final, nil
}
