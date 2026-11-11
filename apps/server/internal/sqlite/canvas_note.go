package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/note"
	canvasnotequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/canvasnote"
	searchquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/search"
	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) GetNote(ctx context.Context, id string) (note.Note, error) {
	return canvasnotequery.GetNote(s.db, ctx, id)
}

func (s *Store) ListBacklinks(ctx context.Context, id string) ([]note.Backlink, error) {
	return canvasnotequery.ListBacklinks(s.db, ctx, id)
}

func (s *Store) UpdateNote(ctx context.Context, id string, request note.UpdateRequest) (note.Note, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return note.Note{}, err
	}
	defer tx.Rollback()
	value, err := canvasnotequery.UpdateNoteTx(ctx, tx, id, request, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return note.Note{}, err
	}
	if err := tx.Commit(); err != nil {
		return note.Note{}, err
	}
	return value, nil
}

func (s *Store) CreateNoteInstance(ctx context.Context, workspaceID string, request note.CreateInstanceRequest) (note.CreateInstanceResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return note.CreateInstanceResult{}, err
	}
	defer tx.Rollback()

	if replay, found, err := canvasnotequery.GetCreateRequestTx(ctx, tx, workspaceID, request.ClientRequestID); err != nil {
		return note.CreateInstanceResult{}, err
	} else if found {
		if replay.Note.ID != request.ClientNoteID || replay.Instance.ID != request.ClientInstanceID {
			return note.CreateInstanceResult{}, note.ErrConflict
		}
		canvas, err := workspacequery.GetCanvasState(tx, ctx, workspaceID)
		if err != nil {
			return note.CreateInstanceResult{}, err
		}
		replay.Canvas = canvasState(canvas)
		return commitNoteResult(tx, replay)
	}

	var canonical note.Note
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if request.ExistingNoteID == "" {
		canonical = note.Note{ID: request.ClientNoteID, SchemaVersion: note.SchemaVersion, Revision: 1, Document: request.Document, CreatedAt: now, UpdatedAt: now}
		if err := canvasnotequery.InsertNoteTx(ctx, tx, canonical); err != nil {
			return note.CreateInstanceResult{}, normalizeNoteWriteError(err)
		}
	} else {
		canonical, err = canvasnotequery.GetNote(tx, ctx, request.ExistingNoteID)
		if err != nil {
			return note.CreateInstanceResult{}, err
		}
	}

	instance := note.Instance{
		ID: request.ClientInstanceID, NoteID: canonical.ID, WorkspaceID: workspaceID,
		ElementID: request.ElementID, X: request.X, Y: request.Y, Width: request.Width,
		Height: request.Height, Compact: request.Compact, CreatedAt: now, UpdatedAt: now,
	}
	if err := canvasnotequery.InsertInstanceTx(ctx, tx, instance); err != nil {
		return note.CreateInstanceResult{}, normalizeNoteWriteError(err)
	}

	state, err := updateCanvasInTx(ctx, tx, workspaceID, request.ExpectedCanvasVersion, request.Canvas)
	if err != nil {
		return note.CreateInstanceResult{}, err
	}
	if err := canvasnotequery.InsertCreateRequestTx(ctx, tx, workspaceID, request.ClientRequestID, canonical.ID, instance.ID, state.Version, now); err != nil {
		return note.CreateInstanceResult{}, err
	}
	return commitNoteResult(tx, note.CreateInstanceResult{Note: canonical, Instance: instance, Canvas: canvasState(state)})
}

func (s *Store) DeleteNoteInstance(ctx context.Context, workspaceID, instanceID string, request note.DeleteInstanceRequest) (note.CanvasState, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return note.CanvasState{}, err
	}
	defer tx.Rollback()
	if _, err := canvasnotequery.GetInstanceTx(ctx, tx, workspaceID, instanceID); err != nil {
		return note.CanvasState{}, err
	}
	if err := canvasnotequery.DeleteInstanceTx(ctx, tx, workspaceID, instanceID); err != nil {
		return note.CanvasState{}, err
	}
	state, err := updateCanvasInTx(ctx, tx, workspaceID, request.ExpectedCanvasVersion, request.Canvas)
	if err != nil {
		return note.CanvasState{}, err
	}
	if err := tx.Commit(); err != nil {
		return note.CanvasState{}, err
	}
	return canvasState(state), nil
}

func updateCanvasInTx(ctx context.Context, tx *sql.Tx, workspaceID string, version int, canvas note.CanvasSnapshot) (workspacepkg.CanvasState, error) {
	encoded, err := json.Marshal(canvas)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	value := workspacepkg.Snapshot{Format: canvas.Format, Version: canvas.Version, Data: canvas.Data}
	elementCount, err := workspacequery.CanvasElementCount(value)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	state, err := workspacequery.UpdateCanvasTx(ctx, tx, workspaceID, version, encoded, elementCount, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := canvasnotequery.SyncGeometryTx(ctx, tx, workspaceID, canvas.Data, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := searchquery.AdvanceCanvasRevisionTx(ctx, tx, workspaceID); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	return state, nil
}

func canvasState(value workspacepkg.CanvasState) note.CanvasState {
	return note.CanvasState{
		Canvas:  note.CanvasSnapshot{Format: value.Canvas.Format, Version: value.Canvas.Version, Data: value.Canvas.Data},
		Version: value.Version, UpdatedAt: value.UpdatedAt,
	}
}

func commitNoteResult(tx *sql.Tx, result note.CreateInstanceResult) (note.CreateInstanceResult, error) {
	if err := tx.Commit(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return note.CreateInstanceResult{}, err
	}
	return result, nil
}

func normalizeNoteWriteError(err error) error {
	// SQLite's constraint text is intentionally not sent across HTTP. The
	// serialized Store turns a duplicate identity into a typed conflict.
	if err != nil {
		return note.ErrConflict
	}
	return nil
}
