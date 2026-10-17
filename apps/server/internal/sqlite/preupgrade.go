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

	"github.com/howlil/notespace/apps/server/migrations"
)

// snapshotBeforeMigration makes an independent, verified SQLite copy without
// copying WAL/SHM files or modifying the source library. Never automatically
// delete these snapshots: recovery from failed multi-step migrations depends on
// the copy surviving application restart and failed reinstallation.
func snapshotBeforeMigration(ctx context.Context, db *sql.DB, databasePath string) (string, error) {
	dir := databasePath + ".recovery"
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("create migration recovery directory: %w", err)
	}
	info, err := os.Lstat(dir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("migration recovery path is not a real directory: %s", dir)
	}

	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return "", fmt.Errorf("create recovery snapshot identifier: %w", err)
	}
	base := fmt.Sprintf("pre-migration-%s-%s", time.Now().UTC().Format("20060102T150405.000000000Z"), hex.EncodeToString(suffix[:]))
	partial := filepath.Join(dir, "."+base+".partial.db")
	final := filepath.Join(dir, base+".db")
	defer os.Remove(partial)

	// VACUUM INTO includes committed WAL transactions and produces a consistent
	// standalone SQLite database. The target must not already exist.
	if _, err := db.ExecContext(ctx, `VACUUM INTO ?`, partial); err != nil {
		return "", fmt.Errorf("create pre-migration SQLite snapshot: %w", err)
	}
	if err := os.Chmod(partial, 0600); err != nil {
		return "", fmt.Errorf("protect recovery snapshot permissions: %w", err)
	}

	snapshot, err := sql.Open("sqlite", filepath.ToSlash(partial)+"?mode=ro&_pragma=foreign_keys(1)")
	if err != nil {
		return "", err
	}
	snapshot.SetMaxOpenConns(1)
	validationErr := migrations.ValidateFull(ctx, snapshot)
	closeErr := snapshot.Close()
	if validationErr != nil {
		return "", fmt.Errorf("validate pre-migration snapshot: %w", validationErr)
	}
	if closeErr != nil {
		return "", fmt.Errorf("close pre-migration snapshot: %w", closeErr)
	}

	file, err := os.OpenFile(partial, os.O_RDWR, 0)
	if err != nil {
		return "", err
	}
	syncErr := file.Sync()
	closeErr = file.Close()
	if syncErr != nil {
		return "", fmt.Errorf("sync pre-migration snapshot: %w", syncErr)
	}
	if closeErr != nil {
		return "", closeErr
	}
	if err := os.Rename(partial, final); err != nil {
		return "", fmt.Errorf("publish pre-migration snapshot: %w", err)
	}
	// Directory sync is supported on Unix. Windows rejects syncing directory
	// handles, so filesystem rename durability there relies on the platform.
	if runtime.GOOS != "windows" {
		folder, err := os.Open(dir)
		if err != nil {
			return "", err
		}
		syncErr = folder.Sync()
		closeErr = folder.Close()
		if syncErr != nil {
			return "", fmt.Errorf("sync recovery directory (snapshot is at %s): %w", final, syncErr)
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	slog.Info("verified pre-migration recovery snapshot created", "path", final)
	return final, nil
}
