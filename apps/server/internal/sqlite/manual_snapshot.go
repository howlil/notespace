package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/howlil/notespace/apps/server/migrations"
	_ "modernc.org/sqlite"
)

// CreateManualSnapshot creates a verified, independent, consistent SQLite
// recovery copy without modifying or reopening the canonical database for
// writes. Never rely on a live copy of only notespace.db while WAL is active.
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
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("create backup directory: %w", err)
	}
	dirInfo, err := os.Lstat(dir)
	if err != nil {
		return "", err
	}
	if !dirInfo.IsDir() || dirInfo.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("backup directory is not a real directory")
	}

	var random [8]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	name := fmt.Sprintf("manual-%s-%s.db", time.Now().UTC().Format("20060102T150405.000000000Z"), hex.EncodeToString(random[:]))
	partial := filepath.Join(dir, "."+name+".partial")
	output := filepath.Join(dir, name)
	defer os.Remove(partial)

	// Query-only source: SQLite's VACUUM INTO takes a consistent read snapshot
	// including committed WAL contents, even if the desktop app stays open.
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(absolute)+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return "", fmt.Errorf("open library read only: %w", err)
	}
	db.SetMaxOpenConns(1)
	if err := migrations.ValidateFull(ctx, db); err != nil {
		db.Close()
		return "", fmt.Errorf("source library failed integrity validation: %w", err)
	}
	_, err = db.ExecContext(ctx, "VACUUM INTO ?", partial)
	closeErr := db.Close()
	if err != nil {
		return "", fmt.Errorf("capture SQLite backup: %w", err)
	}
	if closeErr != nil {
		return "", fmt.Errorf("close read-only library: %w", closeErr)
	}

	if err := os.Chmod(partial, 0600); err != nil {
		return "", err
	}
	copyDB, err := sql.Open("sqlite", "file:"+filepath.ToSlash(partial)+"?mode=ro")
	if err != nil {
		return "", err
	}
	copyDB.SetMaxOpenConns(1)
	checkErr := migrations.ValidateFull(ctx, copyDB)
	closeErr = copyDB.Close()
	if checkErr != nil {
		return "", fmt.Errorf("backup integrity check: %w", checkErr)
	}
	if closeErr != nil {
		return "", closeErr
	}

	f, err := os.OpenFile(partial, os.O_RDWR, 0)
	if err != nil {
		return "", err
	}
	syncErr := f.Sync()
	closeErr = f.Close()
	if syncErr != nil {
		return "", syncErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	if err := os.Rename(partial, output); err != nil {
		return "", fmt.Errorf("publish verified backup: %w", err)
	}
	if runtime.GOOS != "windows" {
		folder, err := os.Open(dir)
		if err != nil {
			return "", err
		}
		syncErr = folder.Sync()
		closeErr = folder.Close()
		if syncErr != nil {
			return "", fmt.Errorf("sync published backup directory: %w", syncErr)
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	return output, nil
}
