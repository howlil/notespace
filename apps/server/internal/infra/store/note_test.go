package store

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/howlil/notespace/apps/server/internal/domain"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

// --- merged from canvas_note_test.go ---

func mdDoc(text string) json.RawMessage {
	raw, _ := json.Marshal(map[string]string{"type": "markdown", "text": text})
	return raw
}

func TestCanvasNoteCompactModeFollowsCanonicalScene(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-compact.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := store.CreateWorkspace(ctx, "Compact note")
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "compact-request",
		ClientNoteID:          "compact-note",
		ClientInstanceID:      "compact-instance",
		ElementID:             "compact-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"markdown","text":""}`),
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: compactNoteScene(false)},
		X:                     40,
		Y:                     64,
		Width:                 320,
		Height:                180,
	})
	if err != nil {
		t.Fatal(err)
	}

	canvas := domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: compactNoteScene(true)}
	if _, err := store.UpdateCanvas(ctx, workspace.ID, domain.CanvasUpdate{Canvas: canvas, Version: created.Canvas.Version}); err != nil {
		t.Fatal(err)
	}
	var compact int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT compact FROM canvas_note_instances WHERE workspace_id=? AND id=?`, workspace.ID, created.Instance.ID).Scan(&compact); err != nil {
		t.Fatal(err)
	}
	if compact != 1 {
		t.Fatalf("compact mode was not synchronized from Canvas scene: %d", compact)
	}
}

func compactNoteScene(compact bool) json.RawMessage {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{
			"id": "compact-element", "x": 40, "y": 64, "width": 320, "height": 180,
			"customData": map[string]any{"notespaceNote": map[string]any{
				"noteId": "compact-note", "instanceId": "compact-instance", "compact": compact,
			}},
		}},
		"appState": map[string]any{}, "files": map[string]any{},
	})
	return data
}

func TestNormalizeNoteWriteErrorDoesNotMislabelInfrastructure(t *testing.T) {
	// A generic infrastructure failure must NOT be mislabeled as a user-facing
	// conflict; it must be wrapped and preserved so the transport can return 500.
	infra := errors.New("disk I/O error")
	err := normalizeNoteWriteError(infra)
	if errors.Is(err, domain.ErrNoteConflict) {
		t.Fatalf("infra error mapped to conflict: %v", err)
	}
	if !errors.Is(err, infra) {
		t.Fatalf("infra error cause lost: %v", err)
	}
	// nil stays nil.
	if err := normalizeNoteWriteError(nil); err != nil {
		t.Fatalf("nil error mapped to %v", err)
	}
}

func TestListNotesAndGetNoteInfoSQLite(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-summary-info.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	wsA, err := store.CreateWorkspace(ctx, "Alpha Canvas")
	if err != nil {
		t.Fatal(err)
	}
	wsB, err := store.CreateWorkspace(ctx, "Beta Canvas")
	if err != nil {
		t.Fatal(err)
	}
	wsTrashed, err := store.CreateWorkspace(ctx, "Soon Trashed")
	if err != nil {
		t.Fatal(err)
	}

	makeScene := func(items ...[3]string) domain.CanvasSnapshot {
		elements := make([]any, 0, len(items))
		for _, item := range items {
			elements = append(elements, map[string]any{
				"id": item[0], "isDeleted": false, "x": 10, "y": 20, "width": 320, "height": 180,
				"customData": map[string]any{"notespaceNote": map[string]any{
					"noteId": item[1], "instanceId": item[2],
				}},
			})
		}
		data, _ := json.Marshal(map[string]any{"elements": elements, "appState": map[string]any{}, "files": map[string]any{}})
		return domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: data}
	}

	// Target note placed twice in wsA and once in wsB.
	longBody := strings.Repeat("word ", 70)
	targetDoc := mdDoc("# Target Design ^target-blk-1\n\n" + longBody)
	resA1, err := store.CreateNoteInstance(ctx, wsA.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "req-a1", ClientNoteID: "note-target", ClientInstanceID: "inst-a1", ElementID: "el-a1",
		ExpectedCanvasVersion: wsA.CanvasVersion, Document: targetDoc,
		Canvas: makeScene([3]string{"el-a1", "note-target", "inst-a1"}),
		X:      10, Y: 20, Width: 320, Height: 180, Compact: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	resA2, err := store.CreateNoteInstance(ctx, wsA.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "req-a2", ClientNoteID: "note-target", ExistingNoteID: "note-target", ClientInstanceID: "inst-a2", ElementID: "el-a2",
		ExpectedCanvasVersion: resA1.Canvas.Version,
		Canvas:                makeScene([3]string{"el-a1", "note-target", "inst-a1"}, [3]string{"el-a2", "note-target", "inst-a2"}),
		X:                     400, Y: 20, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	resB1, err := store.CreateNoteInstance(ctx, wsB.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "req-b1", ClientNoteID: "note-target", ExistingNoteID: "note-target", ClientInstanceID: "inst-b1", ElementID: "el-b1",
		ExpectedCanvasVersion: wsB.CanvasVersion,
		Canvas:                makeScene([3]string{"el-b1", "note-target", "inst-b1"}),
		X:                     10, Y: 20, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Referencing note placed in wsB with duplicate links + embed + blockRef to note-target.
	refDoc := mdDoc("Referencing Note [link1](/workspaces/" + wsA.ID + "?noteId=note-target)[link2](/workspaces/" + wsB.ID + "?noteId=note-target&blockId=target-blk-1)\n\n" +
		"![Embedded Note](/workspaces/" + wsA.ID + "?noteId=note-target)\n\n" +
		"[Block reference](/workspaces/" + wsA.ID + "?noteId=note-target&blockId=target-blk-1)")
	if _, err := store.CreateNoteInstance(ctx, wsB.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "req-ref", ClientNoteID: "note-ref", ClientInstanceID: "inst-ref", ElementID: "el-ref",
		ExpectedCanvasVersion: resB1.Canvas.Version, Document: refDoc,
		Canvas: makeScene([3]string{"el-b1", "note-target", "inst-b1"}, [3]string{"el-ref", "note-ref", "inst-ref"}),
		X:      420, Y: 20, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}

	// Note placed only in wsTrashed (which also links to note-target), then wsTrashed is trashed.
	trashedNoteDoc := mdDoc("[Orphaned Backlink](/workspaces/" + wsA.ID + "?noteId=note-target)")
	if _, err := store.CreateNoteInstance(ctx, wsTrashed.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "req-trashed", ClientNoteID: "note-unplaced-after-trash", ClientInstanceID: "inst-trashed", ElementID: "el-trashed",
		ExpectedCanvasVersion: wsTrashed.CanvasVersion, Document: trashedNoteDoc,
		Canvas: makeScene([3]string{"el-trashed", "note-unplaced-after-trash", "inst-trashed"}),
		X:      10, Y: 20, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}
	trashedLatest, err := store.GetWorkspace(ctx, wsTrashed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, wsTrashed.ID, trashedLatest.Version); err != nil {
		t.Fatal(err)
	}

	// Empty toggle note (non-empty by IsEmptyDocument) and blank note.
	if _, err := store.CreateNoteInstance(ctx, wsA.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "req-toggle", ClientNoteID: "note-toggle", ClientInstanceID: "inst-toggle", ElementID: "el-toggle",
		ExpectedCanvasVersion: resA2.Canvas.Version,
		Document:              mdDoc("<details>\n<summary></summary>\n\n</details>"),
		Canvas:                makeScene([3]string{"el-a1", "note-target", "inst-a1"}, [3]string{"el-a2", "note-target", "inst-a2"}, [3]string{"el-toggle", "note-toggle", "inst-toggle"}),
		X:                     780, Y: 20, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}

	// Verify ListNotes summary fields.
	all, err := store.ListNotes(ctx, domain.NoteListQuery{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]domain.NoteSummary{}
	for _, s := range all {
		byID[s.ID] = s
	}
	targetSummary := byID["note-target"]
	if targetSummary.Label != "Target Design" || targetSummary.PlacementCount != 3 || len(targetSummary.WorkspaceIDs) != 2 || targetSummary.IsEmpty {
		t.Fatalf("target summary = %+v", targetSummary)
	}
	if utf8.RuneCountInString(targetSummary.Excerpt) > domain.MaxExcerptRunes {
		t.Fatalf("excerpt exceeded max runes: %d", utf8.RuneCountInString(targetSummary.Excerpt))
	}
	if byID["note-toggle"].IsEmpty {
		t.Fatalf("note-toggle should not be empty: %+v", byID["note-toggle"])
	}

	// Unplaced filter returns note-unplaced-after-trash (its workspace is trashed).
	unplaced, err := store.ListNotes(ctx, domain.NoteListQuery{Unplaced: true, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(unplaced) != 1 || unplaced[0].ID != "note-unplaced-after-trash" || unplaced[0].PlacementCount != 0 || len(unplaced[0].WorkspaceIDs) != 0 {
		t.Fatalf("unplaced notes = %+v", unplaced)
	}

	// Clean query filter does not match JSON metadata or blockId.
	noise, err := store.ListNotes(ctx, domain.NoteListQuery{Query: "paragraph", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(noise) != 0 {
		t.Fatalf("noise query matched notes: %+v", noise)
	}
	matched, err := store.ListNotes(ctx, domain.NoteListQuery{Query: "target design", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(matched) != 1 || matched[0].ID != "note-target" {
		t.Fatalf("query match = %+v", matched)
	}

	// Verify GetNoteInfo placements + backlinks.
	info, err := store.GetNoteInfo(ctx, "note-target")
	if err != nil {
		t.Fatal(err)
	}
	if info.NoteID != "note-target" || len(info.Placements) != 3 {
		t.Fatalf("info placements = %+v", info)
	}
	// Backlinks: 3 deduplicated kinds from note-ref (in wsB) + 1 link from note-unplaced-after-trash (unplaced -> "").
	if len(info.Backlinks) != 4 {
		t.Fatalf("backlinks len = %d, want 4: %+v", len(info.Backlinks), info.Backlinks)
	}
	seenBacklinks := map[string]domain.NoteBacklinkInfo{}
	for _, bl := range info.Backlinks {
		seenBacklinks[bl.NoteID+":"+bl.Kind] = bl
	}
	for _, kind := range []string{domain.BacklinkKindLink, domain.BacklinkKindEmbed, domain.BacklinkKindBlockRef} {
		bl, ok := seenBacklinks["note-ref:"+kind]
		if !ok || bl.WorkspaceID != wsB.ID || bl.WorkspaceTitle != "Beta Canvas" {
			t.Fatalf("missing/wrong note-ref %s backlink: %+v", kind, bl)
		}
	}
	unplacedBL, ok := seenBacklinks["note-unplaced-after-trash:link"]
	if !ok || unplacedBL.Label != "Orphaned Backlink" || unplacedBL.WorkspaceID != "" || unplacedBL.WorkspaceTitle != "" {
		t.Fatalf("unplaced backlink = %+v", unplacedBL)
	}

	if _, err := store.GetNoteInfo(ctx, "does-not-exist"); !errors.Is(err, domain.ErrNoteNotFound) {
		t.Fatalf("missing note info error = %v, want ErrNotFound", err)
	}
}

// --- merged from canvas_note_delete_test.go ---

func TestDeleteEmptyNoteRefusesPlacedOrContentfulNotesAndClearsUndoneOrphans(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := store.CreateWorkspace(ctx, "Delete empty note")
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "empty-request",
		ClientNoteID:          "empty-note",
		ClientInstanceID:      "empty-instance",
		ElementID:             "empty-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"markdown","text":""}`),
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("empty-element", "empty-note", "empty-instance", false)},
		X:                     40, Y: 64, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := store.DeleteEmptyNote(ctx, "empty-note"); !errors.Is(err, domain.ErrNoteInUse) {
		t.Fatalf("placed empty note delete = %v, want ErrNoteInUse", err)
	}

	// Undo removes the element from the Canvas but leaves its instance row behind.
	undone, err := store.UpdateCanvas(ctx, workspace.ID, domain.CanvasUpdate{
		Canvas:  domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("empty-element", "empty-note", "empty-instance", true)},
		Version: created.Canvas.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteEmptyNote(ctx, "empty-note"); err != nil {
		t.Fatalf("undone empty note delete = %v", err)
	}
	if _, err := store.GetNote(ctx, "empty-note"); !errors.Is(err, domain.ErrNoteNotFound) {
		t.Fatalf("deleted note lookup = %v, want ErrNotFound", err)
	}
	var orphans int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_instances WHERE id=?`, created.Instance.ID).Scan(&orphans); err != nil {
		t.Fatal(err)
	}
	if orphans != 0 {
		t.Fatalf("orphan instance rows after delete = %d, want 0", orphans)
	}
	if undone.Version <= created.Canvas.Version {
		t.Fatalf("undo did not advance Canvas version: %+v", undone)
	}

	contentful, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "contentful-request",
		ClientNoteID:          "contentful-note",
		ClientInstanceID:      "contentful-instance",
		ElementID:             "contentful-element",
		ExpectedCanvasVersion: undone.Version,
		Document:              json.RawMessage(`{"type":"markdown","text":"kept"}`),
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("contentful-element", "contentful-note", "contentful-instance", true)},
		X:                     40, Y: 64, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteEmptyNote(ctx, contentful.Note.ID); !errors.Is(err, domain.ErrNoteNotEmpty) {
		t.Fatalf("contentful note delete = %v, want ErrNotEmpty", err)
	}
	if err := store.DeleteEmptyNote(ctx, "missing-note"); !errors.Is(err, domain.ErrNoteNotFound) {
		t.Fatalf("missing note delete = %v, want ErrNotFound", err)
	}
}

func noteDeleteScene(elementID, noteID, instanceID string, deleted bool) json.RawMessage {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{
			"id": elementID, "isDeleted": deleted, "x": 40, "y": 64, "width": 320, "height": 180,
			"customData": map[string]any{"notespaceNote": map[string]any{"noteId": noteID, "instanceId": instanceID}},
		}},
		"appState": map[string]any{}, "files": map[string]any{},
	})
	return data
}

// --- merged from canvas_note_trash_test.go ---

func TestCanvasNoteTrashLifecycle(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-trash.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := store.CreateWorkspace(ctx, "Trash lifecycle")
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "trash-request", ClientNoteID: "trash-note", ClientInstanceID: "trash-instance",
		ElementID: "trash-element", ExpectedCanvasVersion: workspace.CanvasVersion,
		Document: json.RawMessage(`{"type":"markdown","text":"zebrafinch research"}`),
		Canvas:   domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("trash-element", "trash-note", "trash-instance", false)},
		X:        40, Y: 64, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	searchHits := func() int {
		results, err := store.Search(ctx, "zebrafinch")
		if err != nil {
			t.Fatal(err)
		}
		return len(results)
	}
	if searchHits() == 0 {
		t.Fatal("active note is not searchable")
	}

	if err := store.TrashNote(ctx, "trash-note"); err != nil {
		t.Fatalf("trash placed contentful note = %v", err)
	}
	if err := store.TrashNote(ctx, "trash-note"); !errors.Is(err, domain.ErrNoteTrashed) {
		t.Fatalf("second trash = %v, want ErrNoteTrashed", err)
	}
	if err := store.TrashNote(ctx, "missing-note"); !errors.Is(err, domain.ErrNoteNotFound) {
		t.Fatalf("trash missing note = %v, want ErrNotFound", err)
	}

	trashed, err := store.GetNote(ctx, "trash-note")
	if err != nil || trashed.DeletedAt == "" || trashed.Revision != created.Note.Revision {
		t.Fatalf("trashed note = %+v, %v; want readable with deletedAt and unchanged revision", trashed, err)
	}
	if _, err := store.UpdateNote(ctx, "trash-note", domain.UpdateNoteRequest{Document: created.Note.Document, ExpectedRevision: trashed.Revision}); !errors.Is(err, domain.ErrNoteTrashed) {
		t.Fatalf("update trashed note = %v, want ErrNoteTrashed", err)
	}
	if _, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID: "again-request", ClientNoteID: "again-note", ClientInstanceID: "again-instance",
		ExistingNoteID: "trash-note", ElementID: "again-element", ExpectedCanvasVersion: created.Canvas.Version,
		Canvas: domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("again-element", "trash-note", "again-instance", false)},
		X:      40, Y: 64, Width: 320, Height: 180,
	}); !errors.Is(err, domain.ErrNoteTrashed) {
		t.Fatalf("place trashed note = %v, want ErrNoteTrashed", err)
	}

	listed, err := store.ListNotes(ctx, domain.NoteListQuery{Limit: 50})
	if err != nil || len(listed) != 0 {
		t.Fatalf("library list with only a trashed note = %+v, %v; want empty", listed, err)
	}
	if hits := searchHits(); hits != 0 {
		t.Fatalf("trashed note search hits = %d, want 0", hits)
	}
	items, err := store.ListTrashedNotes(ctx)
	if err != nil || len(items) != 1 || items[0].ID != "trash-note" || items[0].PlacementCount != 1 || items[0].Label != "zebrafinch research" {
		t.Fatalf("trashed notes = %+v, %v", items, err)
	}

	if err := store.DeleteEmptyNote(ctx, "trash-note"); !errors.Is(err, domain.ErrNoteNotEmpty) {
		t.Fatalf("guarded delete of trashed contentful note = %v, want ErrNotEmpty", err)
	}

	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.RestoreTrashedNote(ctx, "trash-note"); err != nil {
		t.Fatalf("restore = %v", err)
	}
	restored, err := store.GetNote(ctx, "trash-note")
	if err != nil || restored.DeletedAt != "" {
		t.Fatalf("note after restore = %+v, %v", restored, err)
	}
	if err := store.RestoreTrashedNote(ctx, "trash-note"); !errors.Is(err, domain.ErrNoteNotFound) {
		t.Fatalf("restore active note = %v, want ErrNotFound", err)
	}
	if err := store.DeleteTrashedNote(ctx, "trash-note"); !errors.Is(err, domain.ErrNoteNotFound) {
		t.Fatalf("permanent delete of active note = %v, want ErrNotFound", err)
	}
	if hits := searchHits(); hits == 0 {
		t.Fatal("restored note is not searchable again")
	}
	if _, err := store.UpdateNote(ctx, "trash-note", domain.UpdateNoteRequest{Document: created.Note.Document, ExpectedRevision: restored.Revision}); err != nil {
		t.Fatalf("update restored note = %v", err)
	}

	// The archive taken while the note was trashed keeps it trashed after restore.
	if err := store.RestoreBackupArchive(ctx, archive); err != nil {
		t.Fatal(err)
	}
	fromBackup, err := store.GetNote(ctx, "trash-note")
	if err != nil || fromBackup.DeletedAt == "" {
		t.Fatalf("note after backup restore = %+v, %v; want still trashed", fromBackup, err)
	}

	if err := store.DeleteTrashedNote(ctx, "trash-note"); err != nil {
		t.Fatalf("permanent delete = %v", err)
	}
	if _, err := store.GetNote(ctx, "trash-note"); !errors.Is(err, domain.ErrNoteNotFound) {
		t.Fatalf("note after permanent delete = %v, want ErrNotFound", err)
	}
}
