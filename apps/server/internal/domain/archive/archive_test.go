package archive

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/domain"
)

func sampleBackup() domain.LibraryBackup {
	now := "2026-11-25T00:00:00Z"
	ws := domain.Workspace{
		WorkspaceSummary: domain.WorkspaceSummary{
			ID:        "ws-1",
			ParentID:  nil,
			Title:     "Architecture",
			CreatedAt: now,
			UpdatedAt: now,
			Version:   1,
		},
		Canvas: domain.CanvasSnapshot{
			Format:  "excalidraw",
			Version: 1,
			Data:    json.RawMessage(`{"elements":[],"appState":{},"files":{}}`),
		},
		CanvasVersion: 1,
	}
	return domain.LibraryBackup{
		Format:      domain.LibraryBackupFormat,
		Version:     domain.LibraryBackupVersion,
		GeneratedAt: now,
		Workspaces: []domain.WorkspaceEnvelope{{
			Project: ws,
			Assets: []domain.StoredAsset{{
				ID: "img-1", WorkspaceID: "ws-1", MimeType: "image/png", Data: []byte("png-bytes"), CreatedAt: now,
			}},
		}},
		Trash: []domain.TrashRecord{},
	}
}

func TestArchiveEncodeDecodeAndValidateRoundTrip(t *testing.T) {
	raw, err := Encode(sampleBackup())
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if err := domain.ValidateLibraryBackup(decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Workspaces) != 1 || len(decoded.Workspaces[0].Assets) != 1 || string(decoded.Workspaces[0].Assets[0].Data) != "png-bytes" {
		t.Fatalf("decoded backup mismatch: %+v", decoded)
	}
}

func TestArchiveDecodeRejectsUnsafeEntryPaths(t *testing.T) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, err := w.Create("../evil.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.Write([]byte("nope"))
	_ = w.Close()

	if _, err := Decode(buf.Bytes()); !errors.Is(err, domain.ErrBackupInvalid) {
		t.Fatalf("error = %v, want ErrBackupInvalid", err)
	}
}

func TestValidateLibraryBackupRejectsMissingParentAndCycles(t *testing.T) {
	b := sampleBackup()
	missing := "missing-parent"
	b.Workspaces[0].Project.ParentID = &missing
	if err := domain.ValidateLibraryBackup(b); !errors.Is(err, domain.ErrBackupInvalid) {
		t.Fatalf("missing parent error = %v, want ErrBackupInvalid", err)
	}

	b = sampleBackup()
	ws2 := b.Workspaces[0]
	ws2.Project.ID = "ws-2"
	ws2.Assets = nil
	p1 := "ws-2"
	p2 := "ws-1"
	b.Workspaces[0].Project.ParentID = &p1
	ws2.Project.ParentID = &p2
	b.Workspaces = append(b.Workspaces, ws2)
	if err := domain.ValidateLibraryBackup(b); !errors.Is(err, domain.ErrBackupInvalid) {
		t.Fatalf("cycle error = %v, want ErrBackupInvalid", err)
	}
}

func TestArchiveV6RoundTripWithTagsAndNoteTags(t *testing.T) {
	now := "2026-11-26T00:00:00Z"
	b := sampleBackup()
	b.Notes = []domain.Note{{
		ID:            "note-1",
		SchemaVersion: domain.NoteSchemaVersion,
		Revision:      1,
		Document:      json.RawMessage(`{"type":"markdown","text":"# Hello"}`),
		CreatedAt:     now,
		UpdatedAt:     now,
	}}
	b.Tags = []domain.Tag{{
		ID:            "tag-1",
		Name:          "Design",
		NormalizedKey: "design",
		CreatedAt:     now,
		UpdatedAt:     now,
	}}
	b.NoteTags = []domain.NoteTag{{
		NoteID:    "note-1",
		TagID:     "tag-1",
		CreatedAt: now,
	}}

	raw, err := Encode(b)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if err := domain.ValidateLibraryBackup(decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Tags) != 1 || decoded.Tags[0].NormalizedKey != "design" {
		t.Fatalf("decoded tags = %+v", decoded.Tags)
	}
	if len(decoded.NoteTags) != 1 || decoded.NoteTags[0].NoteID != "note-1" || decoded.NoteTags[0].TagID != "tag-1" {
		t.Fatalf("decoded noteTags = %+v", decoded.NoteTags)
	}
}

func TestArchiveDecodesV5ManifestWithoutTags(t *testing.T) {
	now := "2026-11-25T00:00:00Z"
	manifest := Manifest{
		Format:        domain.LibraryBackupFormat,
		Version:       5,
		SchemaVersion: 17,
		GeneratedAt:   now,
		Workspaces: []WorkspaceEnvelope{{
			Project: sampleBackup().Workspaces[0].Project,
			Assets:  []Asset{},
		}},
		Trash: []TrashRecord{},
		Blobs: []Blob{},
	}
	raw, err := writeArchive(manifest, map[string][]byte{})
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(raw)
	if err != nil {
		t.Fatalf("Decode v5 failed: %v", err)
	}
	if err := domain.ValidateLibraryBackup(decoded); err != nil {
		t.Fatalf("Validate v5 failed: %v", err)
	}
	if len(decoded.Workspaces) != 1 || len(decoded.Tags) != 0 || len(decoded.NoteTags) != 0 {
		t.Fatalf("unexpected v5 decoded backup: %+v", decoded)
	}
}
