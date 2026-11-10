package sqlite

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"hash/crc32"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/asset"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func validationArchive(t *testing.T, names []string, manifest []byte) []byte {
	t.Helper()
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	for _, name := range names {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(manifest); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func deceptiveBlobArchive(t *testing.T, method uint16) []byte {
	t.Helper()
	const declaredSize = 1 << 30
	path := "blobs/" + strings.Repeat("a", 64)
	manifest, err := json.Marshal(backupquery.LibraryArchiveManifest{
		Format: backupquery.LibraryBackupFormat, Version: backupquery.LibraryArchiveVersion, SchemaVersion: backupquery.LibraryArchiveSchemaVersion,
		Blobs: []backupquery.ArchiveBlob{{Path: path, SHA256: strings.Repeat("a", 64), Size: declaredSize}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	entry, err := writer.Create(backupquery.ArchiveManifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write(manifest); err != nil {
		t.Fatal(err)
	}
	body := []byte("small actual entry")
	blob, err := writer.CreateRaw(&zip.FileHeader{Name: path, Method: method, UncompressedSize64: declaredSize, CompressedSize64: uint64(len(body)), CRC32: crc32.ChecksumIEEE(body)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := blob.Write(body); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func TestArchiveValidationPreservesExistingSQLiteLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "validation.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	saved, err := workspacepkg.NewService(store).Create(ctx, "Keep existing library")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image", WorkspaceID: saved.ID, MimeType: "image/png", Data: []byte("original")}); err != nil {
		t.Fatal(err)
	}
	before, err := store.libraryBackupAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := json.Marshal(backupquery.LibraryArchiveManifest{Format: backupquery.LibraryBackupFormat, Version: backupquery.LibraryArchiveVersion, SchemaVersion: backupquery.LibraryArchiveSchemaVersion})
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name    string
		data    []byte
		message string
	}{
		{"invalid ZIP", []byte("not a ZIP"), "invalid ZIP backup"},
		{"expanded store blob", deceptiveBlobArchive(t, zip.Store), "backup expands beyond round-trip bound"},
		{"compressed blob", deceptiveBlobArchive(t, zip.Deflate), "blob entry mismatch"},
		{"unsafe relative", validationArchive(t, []string{"../outside"}, manifest), "unsafe backup entry"},
		{"unsafe absolute", validationArchive(t, []string{"/outside"}, manifest), "unsafe backup entry"},
		{"unsafe Windows", validationArchive(t, []string{`folder\outside`}, manifest), "unsafe backup entry"},
		{"duplicate", validationArchive(t, []string{backupquery.ArchiveManifestPath, backupquery.ArchiveManifestPath}, manifest), "duplicate backup entry"},
		{"missing manifest", validationArchive(t, []string{"other"}, manifest), "backup manifest missing"},
		{"oversized compressed manifest", validationArchive(t, []string{backupquery.ArchiveManifestPath}, bytes.Repeat([]byte(" "), backupquery.MaxArchiveManifestBytes+1)), "backup entry exceeds size limit"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := store.RestoreBackupArchive(ctx, tc.data)
			if !errors.Is(err, workspacepkg.ErrInvalid) || !strings.Contains(err.Error(), tc.message) {
				t.Fatalf("restore error = %v; want invalid: %s", err, tc.message)
			}
			after, err := store.libraryBackupAtomic(ctx)
			if err != nil {
				t.Fatal(err)
			}
			before.GeneratedAt, after.GeneratedAt = "", ""
			if !reflect.DeepEqual(before, after) {
				prior, _ := json.Marshal(before)
				current, _ := json.Marshal(after)
				t.Fatalf("rejected archive changed library:\nbefore %s\nafter %s", prior, current)
			}
		})
	}
}
