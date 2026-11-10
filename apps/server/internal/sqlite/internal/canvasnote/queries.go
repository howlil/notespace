package canvasnotequery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

type scanner interface{ Scan(...any) error }

func noteFromRow(row scanner) (note.Note, error) {
	var value note.Note
	var document string
	if err := row.Scan(&value.ID, &value.SchemaVersion, &document, &value.Revision, &value.CreatedAt, &value.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return note.Note{}, note.ErrNotFound
		}
		return note.Note{}, err
	}
	value.Document = json.RawMessage(document)
	return value, nil
}

func GetNote(db dbtx.DBTX, ctx context.Context, id string) (note.Note, error) {
	return noteFromRow(db.QueryRowContext(ctx, `
		SELECT id,schema_version,document_state,revision,created_at,updated_at
		FROM canvas_notes WHERE id=?`, id))
}

func InsertNoteTx(ctx context.Context, tx dbtx.DBTX, value note.Note) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
		value.ID, value.SchemaVersion, string(value.Document), value.Revision, value.CreatedAt, value.UpdatedAt)
	return err
}

func UpdateNoteTx(ctx context.Context, tx dbtx.DBTX, id string, request note.UpdateRequest, updatedAt string) (note.Note, error) {
	var value note.Note
	var document string
	err := tx.QueryRowContext(ctx, `
		UPDATE canvas_notes
		SET document_state=?,revision=revision+1,updated_at=?
		WHERE id=? AND revision=?
		RETURNING id,schema_version,document_state,revision,created_at,updated_at`,
		string(request.Document), updatedAt, id, request.ExpectedRevision,
	).Scan(&value.ID, &value.SchemaVersion, &document, &value.Revision, &value.CreatedAt, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		if _, lookupErr := GetNote(tx, ctx, id); errors.Is(lookupErr, note.ErrNotFound) {
			return note.Note{}, note.ErrNotFound
		}
		return note.Note{}, note.ErrConflict
	}
	if err != nil {
		return note.Note{}, err
	}
	value.Document = json.RawMessage(document)
	return value, nil
}

func InsertInstanceTx(ctx context.Context, tx dbtx.DBTX, value note.Instance) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO canvas_note_instances(id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		value.ID, value.NoteID, value.WorkspaceID, value.ElementID, value.X, value.Y, value.Width, value.Height, boolInt(value.Compact), value.CreatedAt, value.UpdatedAt)
	return err
}

func GetInstanceTx(ctx context.Context, tx dbtx.DBTX, workspaceID, instanceID string) (note.Instance, error) {
	var value note.Instance
	var compact int
	err := tx.QueryRowContext(ctx, `SELECT id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at FROM canvas_note_instances WHERE workspace_id=? AND id=?`, workspaceID, instanceID).
		Scan(&value.ID, &value.NoteID, &value.WorkspaceID, &value.ElementID, &value.X, &value.Y, &value.Width, &value.Height, &compact, &value.CreatedAt, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return note.Instance{}, note.ErrNotFound
	}
	if err != nil {
		return note.Instance{}, err
	}
	value.Compact = compact != 0
	return value, nil
}

func DeleteInstanceTx(ctx context.Context, tx dbtx.DBTX, workspaceID, instanceID string) error {
	result, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_instances WHERE workspace_id=? AND id=?`, workspaceID, instanceID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return note.ErrNotFound
	}
	return nil
}

func GetCreateRequestTx(ctx context.Context, tx dbtx.DBTX, workspaceID, requestID string) (note.CreateInstanceResult, bool, error) {
	var noteID, instanceID string
	var canvasVersion int
	err := tx.QueryRowContext(ctx, `SELECT note_id,instance_id,canvas_version FROM canvas_note_create_requests WHERE workspace_id=? AND client_request_id=?`, workspaceID, requestID).Scan(&noteID, &instanceID, &canvasVersion)
	if errors.Is(err, sql.ErrNoRows) {
		return note.CreateInstanceResult{}, false, nil
	}
	if err != nil {
		return note.CreateInstanceResult{}, false, err
	}
	created, err := GetNote(tx, ctx, noteID)
	if err != nil {
		return note.CreateInstanceResult{}, false, err
	}
	instance, err := GetInstanceTx(ctx, tx, workspaceID, instanceID)
	if err != nil {
		return note.CreateInstanceResult{}, false, err
	}
	return note.CreateInstanceResult{Note: created, Instance: instance, Canvas: note.CanvasState{Version: canvasVersion}}, true, nil
}

func InsertCreateRequestTx(ctx context.Context, tx dbtx.DBTX, workspaceID, requestID, noteID, instanceID string, canvasVersion int, createdAt string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO canvas_note_create_requests(workspace_id,client_request_id,note_id,instance_id,canvas_version,created_at) VALUES (?,?,?,?,?,?)`, workspaceID, requestID, noteID, instanceID, canvasVersion, createdAt)
	return err
}

func SyncGeometryTx(ctx context.Context, tx dbtx.DBTX, workspaceID string, canvasData json.RawMessage, updatedAt string) error {
	var scene struct {
		Elements []struct {
			ID         string  `json:"id"`
			IsDeleted  bool    `json:"isDeleted"`
			X          float64 `json:"x"`
			Y          float64 `json:"y"`
			Width      float64 `json:"width"`
			Height     float64 `json:"height"`
			CustomData struct {
				Reference struct {
					NoteID     string `json:"noteId"`
					InstanceID string `json:"instanceId"`
				} `json:"notespaceNote"`
			} `json:"customData"`
		} `json:"elements"`
	}
	if err := json.Unmarshal(canvasData, &scene); err != nil {
		return note.ErrInvalid
	}
	for _, element := range scene.Elements {
		if element.IsDeleted || element.CustomData.Reference.InstanceID == "" || !note.ValidateGeometry(element.X, element.Y, element.Width, element.Height) {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE canvas_note_instances SET element_id=?,x=?,y=?,width=?,height=?,updated_at=? WHERE workspace_id=? AND id=? AND note_id=?`, element.ID, element.X, element.Y, element.Width, element.Height, updatedAt, workspaceID, element.CustomData.Reference.InstanceID, element.CustomData.Reference.NoteID); err != nil {
			return err
		}
	}
	return nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
