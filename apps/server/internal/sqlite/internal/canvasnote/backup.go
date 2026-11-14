package canvasnotequery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

func SnapshotNotesTx(ctx context.Context, tx dbtx.DBTX) ([]note.Note, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,schema_version,document_state,revision,created_at,updated_at FROM canvas_notes ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []note.Note{}
	for rows.Next() {
		var value note.Note
		var document string
		if err := rows.Scan(&value.ID, &value.SchemaVersion, &document, &value.Revision, &value.CreatedAt, &value.UpdatedAt); err != nil {
			return nil, err
		}
		value.Document = json.RawMessage(document)
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return values, nil
}

func SnapshotInstancesTx(ctx context.Context, tx dbtx.DBTX, workspaceID string) ([]note.Instance, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at FROM canvas_note_instances WHERE workspace_id=? ORDER BY id`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []note.Instance{}
	for rows.Next() {
		var value note.Instance
		var compact int
		if err := rows.Scan(&value.ID, &value.NoteID, &value.WorkspaceID, &value.ElementID, &value.X, &value.Y, &value.Width, &value.Height, &compact, &value.CreatedAt, &value.UpdatedAt); err != nil {
			return nil, err
		}
		value.Compact = compact != 0
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return values, nil
}

func RestoreNotesTx(ctx context.Context, tx dbtx.DBTX, values []note.Note) error {
	for _, value := range values {
		if note.ValidateNote(value) != nil {
			return note.ErrInvalid
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at) VALUES (?,?,?,?,?,?)`, value.ID, value.SchemaVersion, string(value.Document), value.Revision, value.CreatedAt, value.UpdatedAt); err != nil {
			return err
		}
	}
	return nil
}

func RestoreInstancesTx(ctx context.Context, tx dbtx.DBTX, workspaceID string, values []note.Instance) error {
	for _, value := range values {
		if note.ValidateInstance(value, workspaceID) != nil {
			return note.ErrInvalid
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO canvas_note_instances(id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, value.ID, value.NoteID, value.WorkspaceID, value.ElementID, value.X, value.Y, value.Width, value.Height, boolInt(value.Compact), value.CreatedAt, value.UpdatedAt); err != nil {
			return err
		}
	}
	return nil
}

func DeleteAllTx(ctx context.Context, tx dbtx.DBTX) error {
	for _, statement := range []string{
		`DELETE FROM canvas_note_create_requests`,
		`DELETE FROM canvas_note_instances`,
		`DELETE FROM canvas_notes`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func EnsureNoteExistsTx(ctx context.Context, tx dbtx.DBTX, id string) error {
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_notes WHERE id=?`, id).Scan(&count); err != nil {
		return err
	}
	if count != 1 {
		return note.ErrInvalid
	}
	return nil
}

func IsMissing(err error) bool { return errors.Is(err, sql.ErrNoRows) }
