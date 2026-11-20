package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/howlil/notespace/apps/server/internal/note"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestCanvasNoteCompactModeFollowsCanonicalScene(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-compact.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Compact note")
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "compact-request",
		ClientNoteID:          "compact-note",
		ClientInstanceID:      "compact-instance",
		ElementID:             "compact-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[]}`),
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: compactNoteScene(false)},
		X:                     40,
		Y:                     64,
		Width:                 320,
		Height:                180,
	})
	if err != nil {
		t.Fatal(err)
	}

	canvas := workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: compactNoteScene(true)}
	if _, err := store.UpdateCanvas(ctx, workspace.ID, workspacepkg.CanvasUpdate{Canvas: canvas, Version: created.Canvas.Version}); err != nil {
		t.Fatal(err)
	}
	var compact int
	if err := store.db.QueryRowContext(ctx, `SELECT compact FROM canvas_note_instances WHERE workspace_id=? AND id=?`, workspace.ID, created.Instance.ID).Scan(&compact); err != nil {
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
	if errors.Is(err, note.ErrConflict) {
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

	wsService := workspacepkg.NewService(store)
	wsA, err := wsService.Create(ctx, "Alpha Canvas")
	if err != nil {
		t.Fatal(err)
	}
	wsB, err := wsService.Create(ctx, "Beta Canvas")
	if err != nil {
		t.Fatal(err)
	}
	wsTrashed, err := wsService.Create(ctx, "Soon Trashed")
	if err != nil {
		t.Fatal(err)
	}

	makeScene := func(items ...[3]string) note.CanvasSnapshot {
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
		return note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: data}
	}

	// Target note placed twice in wsA and once in wsB.
	longBody := strings.Repeat("word ", 70)
	targetDoc := json.RawMessage(`{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"blockId":"target-blk-1"},"content":[{"type":"text","text":"Target Design"}]},{"type":"paragraph","content":[{"type":"text","text":"` + longBody + `"}]}]}`)
	resA1, err := store.CreateNoteInstance(ctx, wsA.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-a1", ClientNoteID: "note-target", ClientInstanceID: "inst-a1", ElementID: "el-a1",
		ExpectedCanvasVersion: wsA.CanvasVersion, Document: targetDoc,
		Canvas: makeScene([3]string{"el-a1", "note-target", "inst-a1"}),
		X:      10, Y: 20, Width: 320, Height: 180, Compact: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	resA2, err := store.CreateNoteInstance(ctx, wsA.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-a2", ClientNoteID: "note-target", ExistingNoteID: "note-target", ClientInstanceID: "inst-a2", ElementID: "el-a2",
		ExpectedCanvasVersion: resA1.Canvas.Version,
		Canvas:                makeScene([3]string{"el-a1", "note-target", "inst-a1"}, [3]string{"el-a2", "note-target", "inst-a2"}),
		X:                     400, Y: 20, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	resB1, err := store.CreateNoteInstance(ctx, wsB.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-b1", ClientNoteID: "note-target", ExistingNoteID: "note-target", ClientInstanceID: "inst-b1", ElementID: "el-b1",
		ExpectedCanvasVersion: wsB.CanvasVersion,
		Canvas:                makeScene([3]string{"el-b1", "note-target", "inst-b1"}),
		X:                     10, Y: 20, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Referencing note placed in wsB with duplicate links + embed + blockRef to note-target.
	refDoc := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"paragraph","content":[
				{"type":"text","text":"Referencing Note "},
				{"type":"text","text":"link1","marks":[{"type":"link","attrs":{"href":"/workspaces/` + wsA.ID + `?noteId=note-target"}}]},
				{"type":"text","text":"link2","marks":[{"type":"link","attrs":{"href":"/workspaces/` + wsB.ID + `?noteId=note-target&blockId=target-blk-1"}}]}
			]},
			{"type":"noteEmbed","attrs":{"noteId":"note-target","workspaceId":"` + wsA.ID + `"}},
			{"type":"noteBlockReference","attrs":{"noteId":"note-target","workspaceId":"` + wsA.ID + `","blockId":"target-blk-1"}}
		]
	}`)
	if _, err := store.CreateNoteInstance(ctx, wsB.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-ref", ClientNoteID: "note-ref", ClientInstanceID: "inst-ref", ElementID: "el-ref",
		ExpectedCanvasVersion: resB1.Canvas.Version, Document: refDoc,
		Canvas: makeScene([3]string{"el-b1", "note-target", "inst-b1"}, [3]string{"el-ref", "note-ref", "inst-ref"}),
		X:      420, Y: 20, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}

	// Note placed only in wsTrashed (which also links to note-target), then wsTrashed is trashed.
	trashedNoteDoc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Orphaned Backlink","marks":[{"type":"link","attrs":{"href":"/workspaces/` + wsA.ID + `?noteId=note-target"}}]}]}]}`)
	if _, err := store.CreateNoteInstance(ctx, wsTrashed.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-trashed", ClientNoteID: "note-unplaced-after-trash", ClientInstanceID: "inst-trashed", ElementID: "el-trashed",
		ExpectedCanvasVersion: wsTrashed.CanvasVersion, Document: trashedNoteDoc,
		Canvas: makeScene([3]string{"el-trashed", "note-unplaced-after-trash", "inst-trashed"}),
		X:      10, Y: 20, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}
	trashedLatest, err := store.Get(ctx, wsTrashed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, wsTrashed.ID, trashedLatest.Version); err != nil {
		t.Fatal(err)
	}

	// Empty toggle note (non-empty by IsEmptyDocument) and blank note.
	if _, err := store.CreateNoteInstance(ctx, wsA.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-toggle", ClientNoteID: "note-toggle", ClientInstanceID: "inst-toggle", ElementID: "el-toggle",
		ExpectedCanvasVersion: resA2.Canvas.Version,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"noteToggle","attrs":{"open":false}}]}`),
		Canvas:                makeScene([3]string{"el-a1", "note-target", "inst-a1"}, [3]string{"el-a2", "note-target", "inst-a2"}, [3]string{"el-toggle", "note-toggle", "inst-toggle"}),
		X:                     780, Y: 20, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}

	// Verify ListNotes summary fields.
	all, err := store.ListNotes(ctx, note.ListQuery{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]note.Summary{}
	for _, s := range all {
		byID[s.ID] = s
	}
	targetSummary := byID["note-target"]
	if targetSummary.Label != "Target Design" || targetSummary.PlacementCount != 3 || len(targetSummary.WorkspaceIDs) != 2 || targetSummary.IsEmpty {
		t.Fatalf("target summary = %+v", targetSummary)
	}
	if utf8.RuneCountInString(targetSummary.Excerpt) > note.MaxExcerptRunes {
		t.Fatalf("excerpt exceeded max runes: %d", utf8.RuneCountInString(targetSummary.Excerpt))
	}
	if byID["note-toggle"].IsEmpty {
		t.Fatalf("note-toggle should not be empty: %+v", byID["note-toggle"])
	}

	// Unplaced filter returns note-unplaced-after-trash (its workspace is trashed).
	unplaced, err := store.ListNotes(ctx, note.ListQuery{Unplaced: true, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(unplaced) != 1 || unplaced[0].ID != "note-unplaced-after-trash" || unplaced[0].PlacementCount != 0 || len(unplaced[0].WorkspaceIDs) != 0 {
		t.Fatalf("unplaced notes = %+v", unplaced)
	}

	// Clean query filter does not match JSON metadata or blockId.
	noise, err := store.ListNotes(ctx, note.ListQuery{Query: "paragraph", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(noise) != 0 {
		t.Fatalf("noise query matched notes: %+v", noise)
	}
	matched, err := store.ListNotes(ctx, note.ListQuery{Query: "target design", Limit: 50})
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
	seenBacklinks := map[string]note.BacklinkInfo{}
	for _, bl := range info.Backlinks {
		seenBacklinks[bl.NoteID+":"+bl.Kind] = bl
	}
	for _, kind := range []string{note.BacklinkKindLink, note.BacklinkKindEmbed, note.BacklinkKindBlockRef} {
		bl, ok := seenBacklinks["note-ref:"+kind]
		if !ok || bl.WorkspaceID != wsB.ID || bl.WorkspaceTitle != "Beta Canvas" {
			t.Fatalf("missing/wrong note-ref %s backlink: %+v", kind, bl)
		}
	}
	unplacedBL, ok := seenBacklinks["note-unplaced-after-trash:link"]
	if !ok || unplacedBL.Label != "Orphaned Backlink" || unplacedBL.WorkspaceID != "" || unplacedBL.WorkspaceTitle != "" {
		t.Fatalf("unplaced backlink = %+v", unplacedBL)
	}

	if _, err := store.GetNoteInfo(ctx, "does-not-exist"); !errors.Is(err, note.ErrNotFound) {
		t.Fatalf("missing note info error = %v, want ErrNotFound", err)
	}
}
