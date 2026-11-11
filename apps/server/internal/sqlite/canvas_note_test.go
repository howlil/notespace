package sqlite

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

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
