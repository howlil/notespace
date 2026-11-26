package store

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/archive"
)

const (
	legacyTextNote  = `{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"blockId":"blk-1"},"content":[{"type":"text","text":"Zebrafinch migration"}]},{"type":"paragraph","content":[{"type":"text","text":"keep this"}]}]}`
	legacyMergedTbl = `{"type":"doc","content":[{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","attrs":{"colspan":2},"content":[{"type":"paragraph","content":[{"type":"text","text":"wide"}]}]}]}]}]}`
)

func insertRawNote(t *testing.T, ctx context.Context, store *Store, id, document, deletedAt string) {
	t.Helper()
	var deleted any
	if deletedAt != "" {
		deleted = deletedAt
	}
	if _, err := store.db.Writer().ExecContext(ctx,
		`INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at,deleted_at) VALUES (?,1,?,7,'c','u',?)`,
		id, document, deleted); err != nil {
		t.Fatal(err)
	}
}

func runConversion(t *testing.T, ctx context.Context, store *Store) error {
	t.Helper()
	tx, err := store.db.Writer().BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := convertNotesToMarkdownTx(ctx, tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func TestRichNotesConvertToMarkdownKeepingIdentityPlacementAssetsAndSearch(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "legacy-notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := store.CreateWorkspace(ctx, "Legacy workspace")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, domain.StoredAsset{ID: "legacy-img", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("png")}); err != nil {
		t.Fatal(err)
	}
	image := `{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"/api/workspaces/` + workspace.ID + `/assets/legacy-img","assetId":"legacy-img","alt":"photo"}}]}`
	insertRawNote(t, ctx, store, "note-text", legacyTextNote, "")
	insertRawNote(t, ctx, store, "note-image", image, "")
	insertRawNote(t, ctx, store, "note-trashed", legacyMergedTbl, "2025-01-01T00:00:00Z")
	insertRawNote(t, ctx, store, "note-markdown", `{"type":"markdown","text":"keep   exactly"}`, "")
	if _, err := store.db.Writer().ExecContext(ctx,
		`INSERT INTO canvas_note_instances(id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at) VALUES ('inst-1','note-image',?,'el-1',5,6,320,180,0,'c','u')`,
		workspace.ID); err != nil {
		t.Fatal(err)
	}

	if err := runConversion(t, ctx, store); err != nil {
		t.Fatal(err)
	}

	for id, want := range map[string]string{
		"note-text":     `{"type":"markdown","text":"# Zebrafinch migration ^blk-1\n\nkeep this"}`,
		"note-image":    `{"type":"markdown","text":"![photo](/api/workspaces/` + workspace.ID + `/assets/legacy-img)"}`,
		"note-markdown": `{"type":"markdown","text":"keep   exactly"}`,
	} {
		got, err := store.GetNote(ctx, id)
		if err != nil || string(got.Document) != want {
			t.Fatalf("%s = %s (%v), want %s", id, got.Document, err, want)
		}
	}
	if note, _ := store.GetNote(ctx, "note-text"); note.Revision != 8 {
		t.Fatalf("converted Note revision = %d, want 8", note.Revision)
	}
	if note, _ := store.GetNote(ctx, "note-markdown"); note.Revision != 7 {
		t.Fatalf("existing Markdown revision changed to %d", note.Revision)
	}
	if trashed, err := store.GetNote(ctx, "note-trashed"); err != nil || trashed.DeletedAt != "2025-01-01T00:00:00Z" || !strings.Contains(string(trashed.Document), "wide") {
		t.Fatalf("trashed Note = %+v (%v)", trashed, err)
	}
	var instances int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_instances WHERE id='inst-1' AND note_id='note-image'`).Scan(&instances); err != nil || instances != 1 {
		t.Fatalf("placement lost: %d %v", instances, err)
	}
	if _, err := store.GetAsset(ctx, workspace.ID, "legacy-img"); err != nil {
		t.Fatalf("image asset released by the conversion: %v", err)
	}

	var original, degraded string
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT document_state,degraded FROM canvas_note_legacy_documents WHERE note_id='note-trashed'`).Scan(&original, &degraded); err != nil {
		t.Fatal(err)
	}
	if original != legacyMergedTbl || degraded != `["merged table cells"]` {
		t.Fatalf("original not preserved: %s / %s", original, degraded)
	}
	var snapshots int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_legacy_documents`).Scan(&snapshots); err != nil || snapshots != 3 {
		t.Fatalf("snapshots = %d %v, want 3 (existing Markdown is not snapshotted)", snapshots, err)
	}

	results, err := store.Search(ctx, "zebrafinch")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, result := range results {
		found = found || (result.Type == "note" && result.NoteID == "note-text")
	}
	if !found {
		t.Fatalf("converted Note is not searchable: %+v", results)
	}
}

func TestMarkdownConversionFailureRollsBackEveryNote(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "legacy-failure.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	insertRawNote(t, ctx, store, "note-a-good", legacyTextNote, "")
	insertRawNote(t, ctx, store, "note-b-bad", `{"type":"mystery"}`, "")

	err = runConversion(t, ctx, store)
	if err == nil || !strings.Contains(err.Error(), "note note-b-bad") {
		t.Fatalf("error = %v, want a diagnostic naming the Note", err)
	}
	var document string
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT document_state FROM canvas_notes WHERE id='note-a-good'`).Scan(&document); err != nil || document != legacyTextNote {
		t.Fatalf("good Note changed although the migration failed: %s %v", document, err)
	}
	var snapshots int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_legacy_documents`).Scan(&snapshots); err != nil || snapshots != 0 {
		t.Fatalf("partial snapshots committed: %d %v", snapshots, err)
	}
}

func archiveWithNoteDocument(t *testing.T, store *Store, version int, document string) []byte {
	t.Helper()
	exported, err := store.ExportBackupArchive(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return rewriteArchiveManifest(t, exported, func(manifest *archive.Manifest) {
		manifest.Version = version
		manifest.Notes[0].Document = json.RawMessage(document)
	})
}

func TestOlderArchiveWithRichNotesIsConvertedAtImport(t *testing.T) {
	ctx := context.Background()
	source, err := Open(ctx, filepath.Join(t.TempDir(), "source.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	workspace, err := source.CreateWorkspace(ctx, "Archive")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := source.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "r", ClientNoteID: "archived-note", ClientInstanceID: "i", ElementID: "e",
		ExpectedCanvasVersion: workspace.CanvasVersion, Document: json.RawMessage(`{"type":"markdown","text":"x"}`),
		Canvas: backupNoteCanvas("e", "archived-note", "i"), X: 1, Y: 2, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}

	for _, version := range []int{2, 3} {
		target, err := Open(ctx, filepath.Join(t.TempDir(), "target.db"))
		if err != nil {
			t.Fatal(err)
		}
		if err := target.RestoreBackupArchive(ctx, archiveWithNoteDocument(t, source, version, legacyTextNote)); err != nil {
			t.Fatalf("v%d archive: %v", version, err)
		}
		got, err := target.GetNote(ctx, "archived-note")
		if err != nil || string(got.Document) != `{"type":"markdown","text":"# Zebrafinch migration ^blk-1\n\nkeep this"}` {
			t.Fatalf("v%d restored Note = %s (%v)", version, got.Document, err)
		}
		_ = target.Close()
	}
}

func TestArchiveWithUnconvertibleNoteIsRejectedBeforeReplacingTheLibrary(t *testing.T) {
	ctx := context.Background()
	source, err := Open(ctx, filepath.Join(t.TempDir(), "source.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	workspace, err := source.CreateWorkspace(ctx, "Archive")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := source.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "r", ClientNoteID: "archived-note", ClientInstanceID: "i", ElementID: "e",
		ExpectedCanvasVersion: workspace.CanvasVersion, Document: json.RawMessage(`{"type":"markdown","text":"x"}`),
		Canvas: backupNoteCanvas("e", "archived-note", "i"), X: 1, Y: 2, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}
	target, err := Open(ctx, filepath.Join(t.TempDir(), "target.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer target.Close()
	keep, err := target.CreateWorkspace(ctx, "Keep me")
	if err != nil {
		t.Fatal(err)
	}

	err = target.RestoreBackupArchive(ctx, archiveWithNoteDocument(t, source, 3, `{"type":"mystery"}`))
	if err == nil || (!errors.Is(err, domain.ErrNoteInvalid) && !errors.Is(err, domain.ErrBackupInvalid)) {
		t.Fatalf("restore error = %v, want invalid", err)
	}
	if _, err := target.GetWorkspace(ctx, keep.ID); err != nil {
		t.Fatalf("library replaced by a rejected archive: %v", err)
	}
}
