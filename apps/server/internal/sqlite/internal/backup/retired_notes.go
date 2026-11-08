package backupquery

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const RetiredNotesMigration = "0026_scrub_retired_note_artifacts.sql"

// scrubRetiredNoteArtifactsTx removes old Note-link elements from active and
// history Canvas snapshots, compressed history payloads, and trash envelopes.
// The migration owns the transaction so relational cleanup, JSON scrub,
// derived count, payload re-encoding, and the migration marker commit or
// roll back together. Trash rows stay; only their payloads are rewritten.
func ScrubRetiredNoteArtifactsTx(ctx context.Context, tx *sql.Tx) error {
	// Reapply relational retirement for rows created by compatibility paths
	// after 0025, including history rows whose compressed payload is absent.
	document, err := json.Marshal(EmptyDocumentSnapshot())
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET references_state='[]'`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_history SET document_state=?,notes_state='[]',references_state='[]'`, document); err != nil {
		return err
	}
	lastWorkspaceID := ""
	for {
		row, err := NextCanvasStateRow(ctx, tx, `
SELECT workspace_id,canvas_state
FROM workspace_canvas
WHERE workspace_id > ?
ORDER BY workspace_id
LIMIT 1`, lastWorkspaceID)
		if errors.Is(err, sql.ErrNoRows) {
			break
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

	lastHistoryID := ""
	for {
		row, err := NextCanvasStateRow(ctx, tx, `
SELECT id,canvas_state
FROM workspace_history
WHERE id > ?
ORDER BY id
LIMIT 1`, lastHistoryID)
		if errors.Is(err, sql.ErrNoRows) {
			break
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
	if err := ScrubRetiredHistoryPayloadsTx(ctx, tx); err != nil {
		return err
	}
	return ScrubRetiredTrashTx(ctx, tx)
}

type HistoryPayloadRow struct {
	id          string
	workspaceID string
	version     int
	title       string
	splitRatio  float64
	createdAt   string
	codec       string
	payload     []byte
}

func ScrubRetiredHistoryPayloadsTx(ctx context.Context, tx *sql.Tx) error {
	lastHistoryID := ""
	for {
		value, err := NextHistoryPayloadRow(ctx, tx, lastHistoryID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		var snapshot workspacepkg.HistorySnapshot
		if err := workspacequery.DecodeHistoryPayload(value.codec, value.payload, &snapshot); err != nil {
			return fmt.Errorf("decode history payload %s: %w", value.id, err)
		}
		snapshot.ID = value.id
		snapshot.WorkspaceID = value.workspaceID
		snapshot.Version = value.version
		snapshot.Title = value.title
		snapshot.SplitRatio = value.splitRatio
		snapshot.CreatedAt = value.createdAt
		if err := NormalizeRetiredHistorySnapshot(&snapshot); err != nil {
			return fmt.Errorf("normalize history payload %s: %w", value.id, err)
		}
		encoded, hash, err := workspacequery.EncodeHistoryPayload(snapshot)
		if err != nil {
			return fmt.Errorf("encode history payload %s: %w", value.id, err)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_history_payload SET content_hash=?,codec=?,payload=?,payload_size=? WHERE history_id=?`, hash, "zlib-json-v1", encoded, len(encoded), value.id); err != nil {
			return err
		}
		lastHistoryID = value.id
	}
}

func ScrubRetiredTrashTx(ctx context.Context, tx *sql.Tx) error {
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
		if err := NormalizeRetiredEnvelope(&envelope); err != nil {
			return fmt.Errorf("normalize trash envelope %s: %w", id, err)
		}
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

func NormalizeRetiredHistorySnapshot(snapshot *workspacepkg.HistorySnapshot) error {
	snapshot.Document = EmptyDocumentSnapshot()
	snapshot.Notes = nil
	snapshot.References = nil
	canvas, err := ScrubRetiredSnapshot(snapshot.Canvas)
	if err != nil {
		return err
	}
	snapshot.Canvas = canvas
	return nil
}

type CanvasStateRow struct {
	id   string
	data string
}

func NextCanvasStateRow(ctx context.Context, tx *sql.Tx, query, lastID string) (CanvasStateRow, error) {
	var value CanvasStateRow
	err := tx.QueryRowContext(ctx, query, lastID).Scan(&value.id, &value.data)
	return value, err
}

func NextHistoryPayloadRow(ctx context.Context, tx *sql.Tx, lastID string) (HistoryPayloadRow, error) {
	var value HistoryPayloadRow
	err := tx.QueryRowContext(ctx, `
SELECT h.id,h.workspace_id,h.version,h.title,h.split_ratio,h.created_at,p.codec,p.payload
FROM workspace_history h
JOIN workspace_history_payload p ON p.history_id=h.id
WHERE h.id > ?
ORDER BY h.id
LIMIT 1`, lastID).Scan(
		&value.id,
		&value.workspaceID,
		&value.version,
		&value.title,
		&value.splitRatio,
		&value.createdAt,
		&value.codec,
		&value.payload,
	)
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

func NormalizeRetiredBackup(backup *LibraryBackup) error {
	for i := range backup.Workspaces {
		if err := NormalizeRetiredEnvelope(&backup.Workspaces[i]); err != nil {
			return err
		}
	}
	for i := range backup.Trash {
		if err := NormalizeRetiredEnvelope(&backup.Trash[i].Payload); err != nil {
			return err
		}
	}
	if backup.Version < LibraryBackupVersion {
		for i := range backup.Captures {
			if backup.Captures[i].TargetKind != "note" {
				continue
			}
			backup.Captures[i].Status = "pending"
			backup.Captures[i].Version++
			backup.Captures[i].TargetKind = ""
			backup.Captures[i].TargetWorkspaceID = ""
			backup.Captures[i].TargetID = ""
			backup.Captures[i].ConvertedAt = ""
		}
	}
	return nil
}

func NormalizeRetiredEnvelope(envelope *WorkspaceEnvelope) error {
	if err := NormalizeRetiredDocument(&envelope.Project.Document); err != nil {
		return err
	}
	envelope.Project.Notes = nil
	envelope.Project.References = nil
	var err error
	envelope.Project.Canvas, err = ScrubRetiredSnapshot(envelope.Project.Canvas)
	if err != nil {
		return workspacepkg.ErrInvalid
	}
	for i := range envelope.History {
		if err := NormalizeRetiredDocument(&envelope.History[i].Document); err != nil {
			return err
		}
		envelope.History[i].Notes = nil
		envelope.History[i].References = nil
		envelope.History[i].Canvas, err = ScrubRetiredSnapshot(envelope.History[i].Canvas)
		if err != nil {
			return workspacepkg.ErrInvalid
		}
	}
	return nil
}

func NormalizeRetiredDocument(snapshot *workspacepkg.Snapshot) error {
	if snapshot.Format != "" || snapshot.Version != 0 || len(snapshot.Data) != 0 {
		if !workspacepkg.ValidDocumentSnapshot(*snapshot) {
			return workspacepkg.ErrInvalid
		}
	}
	*snapshot = EmptyDocumentSnapshot()
	return nil
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

func EmptyDocumentSnapshot() workspacepkg.Snapshot {
	return workspacepkg.Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    json.RawMessage(`{"type":"doc","content":[]}`),
	}
}
