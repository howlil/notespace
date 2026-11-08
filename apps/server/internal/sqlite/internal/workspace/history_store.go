package workspacequery

import (
	"bytes"
	"compress/zlib"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

type ExecContext interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

type HistoryPayload struct {
	Title      string                   `json:"title"`
	Document   workspacepkg.Snapshot    `json:"document"`
	Notes      []workspacepkg.Note      `json:"notes"`
	Canvas     workspacepkg.Snapshot    `json:"canvas"`
	References []workspacepkg.Reference `json:"references"`
	SplitRatio float64                  `json:"splitRatio"`
}

type AuthoredHistoryPayload struct {
	Title      string                   `json:"title"`
	Document   workspacepkg.Snapshot    `json:"document"`
	Notes      []workspacepkg.Note      `json:"notes"`
	Canvas     workspacepkg.Snapshot    `json:"canvas"`
	References []workspacepkg.Reference `json:"references"`
}

func MakeHistoryPayload(snapshot workspacepkg.HistorySnapshot) HistoryPayload {
	return HistoryPayload{
		Title: snapshot.Title, Document: snapshot.Document, Notes: snapshot.Notes,
		Canvas: snapshot.Canvas, References: snapshot.References, SplitRatio: snapshot.SplitRatio,
	}
}

func HistoryAuthoredHash(snapshot workspacepkg.HistorySnapshot) (string, error) {
	raw, err := json.Marshal(AuthoredHistoryPayload{
		Title: snapshot.Title, Document: snapshot.Document, Notes: snapshot.Notes,
		Canvas: snapshot.Canvas, References: snapshot.References,
	})
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

func EncodeHistoryPayload(snapshot workspacepkg.HistorySnapshot) ([]byte, string, error) {
	raw, err := json.Marshal(MakeHistoryPayload(snapshot))
	if err != nil {
		return nil, "", err
	}
	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	if _, err := writer.Write(raw); err != nil {
		_ = writer.Close()
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	hash, err := HistoryAuthoredHash(snapshot)
	if err != nil {
		return nil, "", err
	}
	return compressed.Bytes(), hash, nil
}

func DecodeHistoryPayload(codec string, payload []byte, snapshot *workspacepkg.HistorySnapshot) error {
	if codec != "zlib-json-v1" {
		return fmt.Errorf("unsupported history payload codec %q", codec)
	}
	reader, err := zlib.NewReader(bytes.NewReader(payload))
	if err != nil {
		return err
	}
	raw, readErr := io.ReadAll(reader)
	closeErr := reader.Close()
	if readErr != nil {
		return readErr
	}
	if closeErr != nil {
		return closeErr
	}
	var decoded HistoryPayload
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return err
	}
	snapshot.Title = decoded.Title
	snapshot.Document = decoded.Document
	snapshot.Notes = decoded.Notes
	snapshot.Canvas = decoded.Canvas
	snapshot.References = decoded.References
	snapshot.SplitRatio = decoded.SplitRatio
	return nil
}

func CreateHistory(ctx context.Context, db ExecContext, snapshot workspacepkg.HistorySnapshot) error {
	payload, hash, err := EncodeHistoryPayload(snapshot)
	if err != nil {
		return err
	}
	// Kept only as a legacy backup-import and creation-baseline path.
	_, err = db.ExecContext(ctx, `INSERT INTO workspace_history(id,workspace_id,version,title,document_state,notes_state,canvas_state,references_state,split_ratio,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, snapshot.ID, snapshot.WorkspaceID, snapshot.Version, snapshot.Title, `{}`, `[]`, `{}`, `[]`, snapshot.SplitRatio, snapshot.CreatedAt)
	if err != nil {
		return err
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO workspace_history_payload(history_id,content_hash,codec,payload,payload_size) VALUES (?,?,?,?,?)`, snapshot.ID, hash, "zlib-json-v1", payload, len(payload)); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `DELETE FROM workspace_history WHERE workspace_id=? AND id NOT IN (SELECT id FROM workspace_history WHERE workspace_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50)`, snapshot.WorkspaceID, snapshot.WorkspaceID)
	return err
}
func ListHistory(db dbtx.DBTX, ctx context.Context, workspaceID string) ([]workspacepkg.HistoryEntry, error) {
	rows, err := db.QueryContext(ctx, `SELECT id,workspace_id,version,title,created_at FROM workspace_history WHERE workspace_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []workspacepkg.HistoryEntry{}
	for rows.Next() {
		var entry workspacepkg.HistoryEntry
		if err := rows.Scan(&entry.ID, &entry.WorkspaceID, &entry.Version, &entry.Title, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}
func GetHistory(db dbtx.DBTX, ctx context.Context, workspaceID, historyID string) (workspacepkg.HistorySnapshot, error) {
	var snapshot workspacepkg.HistorySnapshot
	var document, notes, canvas, references string
	var codec sql.NullString
	var payload []byte
	err := db.QueryRowContext(ctx, `SELECT h.id,h.workspace_id,h.version,h.title,h.document_state,h.notes_state,h.canvas_state,h.references_state,h.split_ratio,h.created_at,p.codec,p.payload FROM workspace_history h LEFT JOIN workspace_history_payload p ON p.history_id=h.id WHERE h.workspace_id=? AND h.id=?`, workspaceID, historyID).Scan(&snapshot.ID, &snapshot.WorkspaceID, &snapshot.Version, &snapshot.Title, &document, &notes, &canvas, &references, &snapshot.SplitRatio, &snapshot.CreatedAt, &codec, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return snapshot, workspacepkg.ErrNotFound
	}
	if err != nil {
		return snapshot, err
	}
	if codec.Valid && len(payload) > 0 {
		if err := DecodeHistoryPayload(codec.String, payload, &snapshot); err != nil {
			return snapshot, fmt.Errorf("decode history payload: %w", err)
		}
		return snapshot, nil
	}
	if err = json.Unmarshal([]byte(document), &snapshot.Document); err != nil {
		return snapshot, err
	}
	if err = json.Unmarshal([]byte(notes), &snapshot.Notes); err != nil {
		return snapshot, err
	}
	if err = json.Unmarshal([]byte(canvas), &snapshot.Canvas); err != nil {
		return snapshot, err
	}
	if err = json.Unmarshal([]byte(references), &snapshot.References); err != nil {
		return snapshot, err
	}
	return snapshot, nil
}
