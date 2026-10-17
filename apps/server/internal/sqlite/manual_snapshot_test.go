package sqlite

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestManualSnapshotCapturesCommittedWALWithoutStoppingWriter(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notespace.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if _, err := store.db.ExecContext(ctx, `CREATE TABLE m4_proof(id TEXT PRIMARY KEY,content TEXT NOT NULL); INSERT INTO m4_proof VALUES('saved','authored data')`); err != nil {
		t.Fatal(err)
	}
	output, err := CreateManualSnapshot(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(output, path+".backups"+string(filepath.Separator)) {
		t.Fatalf("unexpected destination: %s", output)
	}
	if !strings.HasSuffix(output, ".db") {
		t.Fatalf("unexpected backup extension: %s", output)
	}
	copyDB, err := sql.Open("sqlite", "file:"+filepath.ToSlash(output)+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer copyDB.Close()
	var content string
	if err := copyDB.QueryRowContext(ctx, `SELECT content FROM m4_proof WHERE id='saved'`).Scan(&content); err != nil || content != "authored data" {
		t.Fatalf("copy omitted committed WAL content %q (%v)", content, err)
	}
	// Creating another backup must never replace the first one.
	second, err := CreateManualSnapshot(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	if output == second {
		t.Fatal("snapshots must have unique names")
	}
	if _, err := os.Stat(output); err != nil {
		t.Fatalf("original snapshot was overwritten: %v", err)
	}
}

func TestManualSnapshotRefusesInvalidSourceWithoutPublishingBackup(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notespace.db")
	if err := os.WriteFile(path, []byte("invalid sqlite bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateManualSnapshot(context.Background(), path); err == nil {
		t.Fatal("corrupt database must not produce a verified recovery point")
	}
	files, err := os.ReadDir(path + ".backups")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".db") {
			t.Fatalf("invalid source published snapshot: %s", file.Name())
		}
	}
}

func TestManualSnapshotDoesNotCreateDatabaseWhenMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing.db")
	if _, err := CreateManualSnapshot(context.Background(), path); err == nil {
		t.Fatal("missing source must not be created")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("backup worker created source database: %v", err)
	}
}
