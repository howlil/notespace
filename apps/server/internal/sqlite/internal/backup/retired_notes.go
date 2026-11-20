package backupquery

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const (
	RetiredNotesMigration           = "0026_scrub_retired_note_artifacts.sql"
	ContractRetiredDomainsMigration = "0031_contract_retired_domains.sql"
)

type canvasStateRow struct {
	id   string
	data string
}

// ScrubRetiredNoteArtifactsTx removes retired Note-link artifacts from active
// Canvas snapshots and Trash envelopes during schema upgrades while keeping all
// active Canvas Notes (`customData.notespaceNote`) untouched. The migration owns
// the transaction so JSON scrub, derived counts, Trash re-encoding, and the
// migration marker commit or roll back together.
func ScrubRetiredNoteArtifactsTx(ctx context.Context, tx *sql.Tx, name string) error {
	switch name {
	case RetiredNotesMigration:
		document, err := json.Marshal(emptyDocumentSnapshot())
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET references_state='[]'`); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_history SET document_state=?,notes_state='[]',references_state='[]'`, document); err != nil {
			return err
		}
		if err := scrubRetiredCanvasTx(ctx, tx); err != nil {
			return err
		}
		if err := scrubRetiredHistoryCanvasTx(ctx, tx); err != nil {
			return err
		}
		return scrubRetiredTrashTx(ctx, tx)
	case ContractRetiredDomainsMigration:
		if err := scrubRetiredCanvasTx(ctx, tx); err != nil {
			return err
		}
		return scrubRetiredTrashTx(ctx, tx)
	default:
		return nil
	}
}

func scrubRetiredCanvasTx(ctx context.Context, tx dbtx.DBTX) error {
	lastWorkspaceID := ""
	for {
		row, err := nextCanvasStateRow(ctx, tx, `
SELECT workspace_id,canvas_state
FROM workspace_canvas
WHERE workspace_id > ?
ORDER BY workspace_id
LIMIT 1`, lastWorkspaceID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		encoded, _, elementCount, err := ScrubCanvasState(row.data)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_canvas SET canvas_state=?,element_count=? WHERE workspace_id=?`, encoded, elementCount, row.id); err != nil {
			return err
		}
		lastWorkspaceID = row.id
	}
}

func scrubRetiredHistoryCanvasTx(ctx context.Context, tx dbtx.DBTX) error {
	lastHistoryID := ""
	for {
		row, err := nextCanvasStateRow(ctx, tx, `
SELECT id,canvas_state
FROM workspace_history
WHERE id > ?
ORDER BY id
LIMIT 1`, lastHistoryID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		lastHistoryID = row.id
		encoded, changed, _, err := ScrubCanvasState(row.data)
		if err != nil {
			return err
		}
		if !changed {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_history SET canvas_state=? WHERE id=?`, encoded, row.id); err != nil {
			return err
		}
	}
}

func scrubRetiredTrashTx(ctx context.Context, tx dbtx.DBTX) error {
	lastID := ""
	for {
		var id string
		var payload []byte
		err := tx.QueryRowContext(ctx, `
SELECT id,payload FROM workspace_trash
WHERE id > ?
ORDER BY id
LIMIT 1`, lastID).Scan(&id, &payload)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		var envelope WorkspaceEnvelope
		if err := DecodeTrashEnvelope(payload, &envelope); err != nil {
			return fmt.Errorf("decode trash envelope %s: %w", id, err)
		}
		canvas, err := ScrubRetiredSnapshot(envelope.Project.Canvas)
		if err != nil {
			return fmt.Errorf("scrub trash envelope %s: %w", id, err)
		}
		envelope.Project.Canvas = canvas
		encoded, err := EncodeTrashEnvelope(envelope)
		if err != nil {
			return fmt.Errorf("encode trash envelope %s: %w", id, err)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_trash SET payload=? WHERE id=?`, encoded, id); err != nil {
			return err
		}
		lastID = id
	}
}

func nextCanvasStateRow(ctx context.Context, tx dbtx.DBTX, query, lastID string) (canvasStateRow, error) {
	var value canvasStateRow
	err := tx.QueryRowContext(ctx, query, lastID).Scan(&value.id, &value.data)
	return value, err
}

func ScrubCanvasState(encoded string) ([]byte, bool, int, error) {
	var snapshot workspacepkg.Snapshot
	if err := json.Unmarshal([]byte(encoded), &snapshot); err != nil {
		return nil, false, 0, err
	}
	if len(bytes.TrimSpace(snapshot.Data)) == 0 {
		return []byte(encoded), false, 0, nil
	}

	var scene map[string]json.RawMessage
	if err := json.Unmarshal(snapshot.Data, &scene); err != nil {
		return nil, false, 0, err
	}
	if scene == nil {
		return []byte(encoded), false, 0, nil
	}
	rawElements, ok := scene["elements"]
	if !ok || bytes.Equal(bytes.TrimSpace(rawElements), []byte("null")) {
		return []byte(encoded), false, 0, nil
	}

	var elements []json.RawMessage
	if err := json.Unmarshal(rawElements, &elements); err != nil {
		return nil, false, 0, err
	}
	filtered := make([]json.RawMessage, 0, len(elements))
	changed := false
	elementCount := 0
	for _, element := range elements {
		var object map[string]json.RawMessage
		if err := json.Unmarshal(element, &object); err != nil {
			return nil, false, 0, err
		}
		var customData map[string]json.RawMessage
		if rawCustomData, ok := object["customData"]; ok && json.Unmarshal(rawCustomData, &customData) == nil {
			if _, retired := customData["notespaceNoteArtifact"]; retired {
				changed = true
				continue
			}
		}
		filtered = append(filtered, element)
		var state struct {
			IsDeleted bool `json:"isDeleted"`
		}
		if json.Unmarshal(element, &state) == nil && !state.IsDeleted {
			elementCount++
		}
	}
	if !changed {
		return []byte(encoded), false, elementCount, nil
	}

	encodedElements, err := json.Marshal(filtered)
	if err != nil {
		return nil, false, 0, err
	}
	scene["elements"] = encodedElements
	snapshot.Data, err = json.Marshal(scene)
	if err != nil {
		return nil, false, 0, err
	}
	encodedSnapshot, err := json.Marshal(snapshot)
	if err != nil {
		return nil, false, 0, err
	}
	return encodedSnapshot, true, elementCount, nil
}

func ScrubRetiredSnapshot(snapshot workspacepkg.Snapshot) (workspacepkg.Snapshot, error) {
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return workspacepkg.Snapshot{}, err
	}
	encoded, _, _, err = ScrubCanvasState(string(encoded))
	if err != nil {
		return workspacepkg.Snapshot{}, err
	}
	if err := json.Unmarshal(encoded, &snapshot); err != nil {
		return workspacepkg.Snapshot{}, err
	}
	return snapshot, nil
}

func emptyDocumentSnapshot() workspacepkg.Snapshot {
	return workspacepkg.Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    json.RawMessage(`{"type":"doc","content":[]}`),
	}
}
