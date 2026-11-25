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
			ID:         "ws-1",
			CategoryID: domain.UncategorizedCategoryID,
			Title:      "Architecture",
			CreatedAt:  now,
			UpdatedAt:  now,
			Version:    1,
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
		Categories: []domain.CategorySummary{{
			ID: domain.UncategorizedCategoryID, Title: "Uncategorized", CreatedAt: now, UpdatedAt: now,
		}},
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

func TestValidateLibraryBackupRequiresUncategorizedCategory(t *testing.T) {
	b := sampleBackup()
	b.Categories[0].ID = "custom"
	b.Workspaces[0].Project.CategoryID = "custom"
	if err := domain.ValidateLibraryBackup(b); !errors.Is(err, domain.ErrBackupInvalid) {
		t.Fatalf("error = %v, want ErrBackupInvalid", err)
	}
}
