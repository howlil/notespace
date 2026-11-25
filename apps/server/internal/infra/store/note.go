package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
)

const noteColumns = `id,schema_version,document_state,revision,created_at,updated_at,deleted_at`

func (s *Store) GetNote(ctx context.Context, id string) (domain.Note, error) {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxNoteIDLength) {
		return domain.Note{}, domain.ErrNoteInvalid
	}
	return getNoteTx(ctx, s.db.ReadPool(), id)
}

func (s *Store) ListNotes(ctx context.Context, query domain.NoteListQuery) ([]domain.NoteSummary, error) {
	query.Query = strings.TrimSpace(query.Query)
	if query.Limit == 0 {
		query.Limit = domain.DefaultNoteLimit
	}
	if query.Limit < 0 || query.Limit > domain.MaxNoteLimit {
		return nil, domain.ErrNoteInvalid
	}
	var out []domain.NoteSummary
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		var err error
		out, err = listNotesTx(ctx, tx, query)
		return err
	})
	if err != nil {
		return nil, err
	}
	if out == nil {
		return []domain.NoteSummary{}, nil
	}
	return out, nil
}

func (s *Store) GetNoteInfo(ctx context.Context, id string) (domain.NoteInfo, error) {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxNoteIDLength) {
		return domain.NoteInfo{}, domain.ErrNoteInvalid
	}
	var out domain.NoteInfo
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		var err error
		out, err = getNoteInfoTx(ctx, tx, id)
		return err
	})
	return out, err
}

func (s *Store) UpdateNote(ctx context.Context, id string, request domain.UpdateNoteRequest) (domain.Note, error) {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxNoteIDLength) || request.ExpectedRevision < 1 {
		return domain.Note{}, domain.ErrNoteInvalid
	}
	if _, err := domain.ParseDocument(request.Document); err != nil {
		return domain.Note{}, domain.ErrNoteInvalid
	}
	var out domain.Note
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		now := sqlite.NowUTC()
		value, err := noteFromRow(tx.QueryRowContext(ctx, `
			UPDATE canvas_notes
			SET document_state=?,revision=revision+1,updated_at=?
			WHERE id=? AND revision=? AND deleted_at IS NULL
			RETURNING `+noteColumns,
			string(request.Document), now, id, request.ExpectedRevision,
		))
		if errors.Is(err, domain.ErrNoteNotFound) {
			current, lookupErr := getNoteTx(ctx, tx, id)
			if errors.Is(lookupErr, domain.ErrNoteNotFound) {
				return domain.ErrNoteNotFound
			}
			if lookupErr == nil && current.DeletedAt != "" {
				return domain.ErrNoteTrashed
			}
			return domain.ErrNoteConflict
		}
		if err != nil {
			return err
		}
		out = value
		return nil
	})
	return out, err
}

// CreateNoteInstance parses the Excalidraw scene once at ingress and executes
// idempotency replay, Note creation, Instance placement, and Canvas update
// inside one serialized write transaction.
func (s *Store) CreateNoteInstance(ctx context.Context, workspaceID string, request domain.CreateNoteInstanceRequest) (domain.CreateNoteInstanceResult, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if !domain.ValidID(workspaceID, domain.MaxNoteIDLength) ||
		!domain.ValidID(request.ClientRequestID, domain.MaxRequestIDLength) ||
		!domain.ValidID(request.ClientInstanceID, domain.MaxInstanceIDLength) ||
		!domain.ValidID(request.ElementID, domain.MaxInstanceIDLength) ||
		request.ExpectedCanvasVersion < 1 ||
		!domain.ValidateGeometry(request.X, request.Y, request.Width, request.Height) {
		return domain.CreateNoteInstanceResult{}, domain.ErrNoteInvalid
	}
	noteID := request.ClientNoteID
	if request.ExistingNoteID != "" {
		if !domain.ValidID(request.ExistingNoteID, domain.MaxNoteIDLength) {
			return domain.CreateNoteInstanceResult{}, domain.ErrNoteInvalid
		}
		noteID = request.ExistingNoteID
	} else {
		if !domain.ValidID(request.ClientNoteID, domain.MaxNoteIDLength) {
			return domain.CreateNoteInstanceResult{}, domain.ErrNoteInvalid
		}
		if _, err := domain.ParseDocument(request.Document); err != nil {
			return domain.CreateNoteInstanceResult{}, domain.ErrNoteInvalid
		}
	}
	scene, err := domain.ParseScene(request.Canvas)
	if err != nil || !scene.HasReference(request.ElementID, noteID, request.ClientInstanceID) {
		return domain.CreateNoteInstanceResult{}, domain.ErrNoteInvalid
	}

	var out domain.CreateNoteInstanceResult
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		if replay, found, err := getCreateNoteRequestTx(ctx, tx, workspaceID, request.ClientRequestID); err != nil {
			return err
		} else if found {
			if replay.Note.ID != noteID || replay.Instance.ID != request.ClientInstanceID {
				return domain.ErrNoteConflict
			}
			canvas, err := getCanvasStateTx(ctx, tx, workspaceID)
			if err != nil {
				return err
			}
			replay.Canvas = canvas
			out = replay
			return nil
		}

		var canonical domain.Note
		var err error
		now := sqlite.NowUTC()
		if request.ExistingNoteID == "" {
			canonical = domain.Note{
				ID: request.ClientNoteID, SchemaVersion: domain.NoteSchemaVersion, Revision: 1,
				Document: request.Document, CreatedAt: now, UpdatedAt: now,
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
				canonical.ID, canonical.SchemaVersion, string(canonical.Document), canonical.Revision, canonical.CreatedAt, canonical.UpdatedAt,
			); err != nil {
				return normalizeNoteWriteError(err)
			}
		} else {
			canonical, err = getNoteTx(ctx, tx, request.ExistingNoteID)
			if err != nil {
				return err
			}
			if canonical.DeletedAt != "" {
				return domain.ErrNoteTrashed
			}
		}

		instance := domain.NoteInstance{
			ID: request.ClientInstanceID, NoteID: canonical.ID, WorkspaceID: workspaceID,
			ElementID: request.ElementID, X: request.X, Y: request.Y, Width: request.Width,
			Height: request.Height, Compact: request.Compact, CreatedAt: now, UpdatedAt: now,
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO canvas_note_instances(id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			instance.ID, instance.NoteID, instance.WorkspaceID, instance.ElementID, instance.X, instance.Y, instance.Width, instance.Height, sqlite.BoolInt(instance.Compact), instance.CreatedAt, instance.UpdatedAt,
		); err != nil {
			return normalizeNoteWriteError(err)
		}

		state, err := applyCanvasTx(ctx, tx, workspaceID, request.ExpectedCanvasVersion, scene)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO canvas_note_create_requests(workspace_id,client_request_id,note_id,instance_id,canvas_version,created_at) VALUES (?,?,?,?,?,?)`,
			workspaceID, request.ClientRequestID, canonical.ID, instance.ID, state.Version, now,
		); err != nil {
			return err
		}
		out = domain.CreateNoteInstanceResult{Note: canonical, Instance: instance, Canvas: state}
		return nil
	})
	return out, err
}

func (s *Store) DeleteNoteInstance(ctx context.Context, workspaceID, instanceID string, request domain.DeleteNoteInstanceRequest) (domain.CanvasState, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	instanceID = strings.TrimSpace(instanceID)
	if !domain.ValidID(workspaceID, domain.MaxNoteIDLength) || !domain.ValidID(instanceID, domain.MaxInstanceIDLength) || request.ExpectedCanvasVersion < 1 {
		return domain.CanvasState{}, domain.ErrNoteInvalid
	}
	scene, err := domain.ParseScene(request.Canvas)
	if err != nil {
		return domain.CanvasState{}, domain.ErrNoteInvalid
	}
	var out domain.CanvasState
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		instance, err := getNoteInstanceTx(ctx, tx, workspaceID, instanceID)
		if err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_instances WHERE workspace_id=? AND id=?`, workspaceID, instanceID)
		if err != nil {
			return err
		}
		if count, err := result.RowsAffected(); err != nil {
			return err
		} else if count != 1 {
			return domain.ErrNoteNotFound
		}
		if err := invalidateNoteSearchTx(ctx, tx, instance.NoteID); err != nil {
			return err
		}
		out, err = applyCanvasTx(ctx, tx, workspaceID, request.ExpectedCanvasVersion, scene)
		return err
	})
	return out, err
}

func (s *Store) DeleteEmptyNote(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxNoteIDLength) {
		return domain.ErrNoteInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		value, err := getNoteTx(ctx, tx, id)
		if err != nil {
			return err
		}
		if !domain.IsEmptyDocument(value.Document) {
			return domain.ErrNoteNotEmpty
		}
		placements, err := listNotePlacementsTx(ctx, tx, id)
		if err != nil {
			return err
		}
		liveByWorkspace := map[string]map[string]bool{}
		for _, placement := range placements {
			live, seen := liveByWorkspace[placement.WorkspaceID]
			if !seen {
				canvas, err := getCanvasStateTx(ctx, tx, placement.WorkspaceID)
				if err != nil {
					return err
				}
				parsed, err := domain.ParseSceneData(canvas.Canvas.Data)
				if err != nil {
					return err
				}
				live = parsed.LiveInstanceIDs(id)
				liveByWorkspace[placement.WorkspaceID] = live
			}
			if live[placement.ID] {
				return domain.ErrNoteInUse
			}
		}
		return deleteNoteTx(ctx, tx, id)
	})
}

func (s *Store) TrashNote(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxNoteIDLength) {
		return domain.ErrNoteInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		now := sqlite.NowUTC()
		result, err := tx.ExecContext(ctx, `UPDATE canvas_notes SET deleted_at=? WHERE id=? AND deleted_at IS NULL`, now, id)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count == 1 {
			return nil
		}
		if _, lookupErr := getNoteTx(ctx, tx, id); lookupErr != nil {
			return lookupErr
		}
		return domain.ErrNoteTrashed
	})
}

func (s *Store) ListTrashedNotes(ctx context.Context) ([]domain.TrashedNote, error) {
	items := []domain.TrashedNote{}
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, `
			SELECT n.id, n.document_state, n.deleted_at,
			  (SELECT COUNT(1) FROM canvas_note_instances i INNER JOIN projects p ON p.id = i.workspace_id WHERE i.note_id = n.id)
			FROM canvas_notes n
			WHERE n.deleted_at IS NOT NULL
			ORDER BY n.deleted_at DESC, n.id ASC`)
		if err != nil {
			return err
		}
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var id, docStr, deletedAt string
			var placementCount int
			if err := rows.Scan(&id, &docStr, &deletedAt, &placementCount); err != nil {
				return err
			}
			parsed := domain.SummarizeDocument(json.RawMessage(docStr))
			items = append(items, domain.TrashedNote{
				ID:             id,
				Label:          parsed.Label,
				Excerpt:        parsed.Excerpt,
				DeletedAt:      deletedAt,
				PlacementCount: placementCount,
			})
		}
		return rows.Err()
	})
	return items, err
}

func (s *Store) RestoreTrashedNote(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxNoteIDLength) {
		return domain.ErrNoteInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE canvas_notes SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`, id)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count != 1 {
			return domain.ErrNoteNotFound
		}
		return invalidateNoteSearchTx(ctx, tx, id)
	})
}

func (s *Store) DeleteTrashedNote(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxNoteIDLength) {
		return domain.ErrNoteInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		var isTrashed int
		err := tx.QueryRowContext(ctx, `SELECT CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END FROM canvas_notes WHERE id=?`, id).Scan(&isTrashed)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && isTrashed == 0) {
			return domain.ErrNoteNotFound
		}
		if err != nil {
			return err
		}
		return deleteNoteTx(ctx, tx, id)
	})
}

// --- internal note SQL helpers ---

func normalizeNoteWriteError(err error) error {
	if sqlite.IsConstraintError(err) {
		return domain.ErrNoteConflict
	}
	return err
}

func noteFromRow(row sqlite.Scanner) (domain.Note, error) {
	var value domain.Note
	var document string
	var deletedAt sql.NullString
	err := row.Scan(&value.ID, &value.SchemaVersion, &document, &value.Revision, &value.CreatedAt, &value.UpdatedAt, &deletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Note{}, domain.ErrNoteNotFound
	}
	if err != nil {
		return domain.Note{}, err
	}
	value.Document = json.RawMessage(document)
	if deletedAt.Valid {
		value.DeletedAt = deletedAt.String
	}
	return value, nil
}

func getNoteTx(ctx context.Context, db sqlite.DBTX, id string) (domain.Note, error) {
	return noteFromRow(db.QueryRowContext(ctx, `SELECT `+noteColumns+` FROM canvas_notes WHERE id=?`, id))
}

func getNoteInstanceTx(ctx context.Context, db sqlite.DBTX, workspaceID, id string) (domain.NoteInstance, error) {
	var value domain.NoteInstance
	var compact int
	err := db.QueryRowContext(ctx,
		`SELECT id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at FROM canvas_note_instances WHERE workspace_id=? AND id=?`,
		workspaceID, id,
	).Scan(&value.ID, &value.NoteID, &value.WorkspaceID, &value.ElementID, &value.X, &value.Y, &value.Width, &value.Height, &compact, &value.CreatedAt, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.NoteInstance{}, domain.ErrNoteNotFound
	}
	value.Compact = compact != 0
	return value, err
}

func getCreateNoteRequestTx(ctx context.Context, tx sqlite.DBTX, workspaceID, requestID string) (domain.CreateNoteInstanceResult, bool, error) {
	var noteID, instanceID string
	err := tx.QueryRowContext(ctx, `SELECT note_id,instance_id FROM canvas_note_create_requests WHERE workspace_id=? AND client_request_id=?`, workspaceID, requestID).Scan(&noteID, &instanceID)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.CreateNoteInstanceResult{}, false, nil
	}
	if err != nil {
		return domain.CreateNoteInstanceResult{}, false, err
	}
	canonical, err := getNoteTx(ctx, tx, noteID)
	if err != nil {
		return domain.CreateNoteInstanceResult{}, false, fmt.Errorf("load replay note: %w", err)
	}
	instance, err := getNoteInstanceTx(ctx, tx, workspaceID, instanceID)
	if err != nil {
		return domain.CreateNoteInstanceResult{}, false, fmt.Errorf("load replay instance: %w", err)
	}
	return domain.CreateNoteInstanceResult{Note: canonical, Instance: instance}, true, nil
}

func listNotePlacementsTx(ctx context.Context, db sqlite.DBTX, noteID string) ([]domain.NoteInstance, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at FROM canvas_note_instances WHERE note_id=? ORDER BY id`,
		noteID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	placements := []domain.NoteInstance{}
	for rows.Next() {
		var value domain.NoteInstance
		var compact int
		if err := rows.Scan(&value.ID, &value.NoteID, &value.WorkspaceID, &value.ElementID, &value.X, &value.Y, &value.Width, &value.Height, &compact, &value.CreatedAt, &value.UpdatedAt); err != nil {
			return nil, err
		}
		value.Compact = compact != 0
		placements = append(placements, value)
	}
	return placements, rows.Err()
}

func deleteNoteTx(ctx context.Context, tx sqlite.DBTX, noteID string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_instances WHERE note_id=?`, noteID); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM canvas_notes WHERE id=?`, noteID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return domain.ErrNoteNotFound
	}
	return nil
}

func syncNoteGeometryTx(ctx context.Context, tx sqlite.DBTX, workspaceID string, placements []domain.CanvasPlacement, updatedAt string) error {
	for _, placement := range placements {
		if placement.InstanceID == "" || !domain.ValidateGeometry(placement.X, placement.Y, placement.Width, placement.Height) {
			continue
		}
		var compact any
		if placement.Compact != nil {
			compact = sqlite.BoolInt(*placement.Compact)
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE canvas_note_instances SET element_id=?,x=?,y=?,width=?,height=?,compact=COALESCE(?,compact),updated_at=? WHERE workspace_id=? AND id=? AND note_id=?`,
			placement.ElementID, placement.X, placement.Y, placement.Width, placement.Height, compact, updatedAt, workspaceID, placement.InstanceID, placement.NoteID,
		); err != nil {
			return err
		}
	}
	return nil
}

type livePlacementRow struct {
	noteID         string
	instanceID     string
	workspaceID    string
	workspaceTitle string
	elementID      string
	compact        bool
}

func loadLivePlacementsByNoteIDsTx(ctx context.Context, tx sqlite.DBTX, noteIDs []string) (map[string][]livePlacementRow, error) {
	result := make(map[string][]livePlacementRow, len(noteIDs))
	const chunkSize = 200
	for start := 0; start < len(noteIDs); start += chunkSize {
		end := min(start+chunkSize, len(noteIDs))
		chunk := noteIDs[start:end]
		placeholders := strings.Repeat("?,", len(chunk)-1) + "?"
		args := make([]any, len(chunk))
		for i, id := range chunk {
			args[i] = id
		}
		if err := func() error {
			rows, err := tx.QueryContext(ctx, `
			SELECT i.note_id, i.id, i.workspace_id, p.title, i.element_id, i.compact
			FROM canvas_note_instances i
			INNER JOIN projects p ON p.id = i.workspace_id
			WHERE i.note_id IN (`+placeholders+`)
			ORDER BY p.updated_at DESC, i.created_at ASC, i.id ASC`, args...)
			if err != nil {
				return err
			}
			defer func() { _ = rows.Close() }()
			for rows.Next() {
				var row livePlacementRow
				var compact int
				if err := rows.Scan(&row.noteID, &row.instanceID, &row.workspaceID, &row.workspaceTitle, &row.elementID, &compact); err != nil {
					return err
				}
				row.compact = compact != 0
				result[row.noteID] = append(result[row.noteID], row)
			}
			return rows.Err()
		}(); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func listNotesTx(ctx context.Context, tx sqlite.DBTX, query domain.NoteListQuery) ([]domain.NoteSummary, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = domain.DefaultNoteLimit
	}
	filter := strings.TrimSpace(query.Query)

	var sb strings.Builder
	sb.WriteString(`SELECT n.id, n.document_state, n.created_at, n.updated_at FROM canvas_notes n WHERE n.deleted_at IS NULL`)
	var args []any
	if query.Unplaced {
		sb.WriteString(` AND NOT EXISTS (
			SELECT 1 FROM canvas_note_instances i
			INNER JOIN projects p ON p.id = i.workspace_id
			WHERE i.note_id = n.id
		)`)
	}
	sb.WriteString(` ORDER BY n.updated_at DESC, n.id ASC`)
	if filter == "" {
		sb.WriteString(` LIMIT ?`)
		args = append(args, limit)
	}

	rows, err := tx.QueryContext(ctx, sb.String(), args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	summaries := []domain.NoteSummary{}
	noteIDs := []string{}
	for rows.Next() {
		var id, docStr, createdAt, updatedAt string
		if err := rows.Scan(&id, &docStr, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		parsed := domain.SummarizeDocument(json.RawMessage(docStr))
		if filter != "" && !domain.MatchesSearchQuery(parsed.PlainText, filter) && !domain.MatchesSearchQuery(parsed.Label, filter) {
			continue
		}
		summaries = append(summaries, domain.NoteSummary{
			ID:           id,
			Label:        parsed.Label,
			Excerpt:      parsed.Excerpt,
			WorkspaceIDs: []string{},
			IsEmpty:      parsed.IsEmpty,
			CreatedAt:    createdAt,
			UpdatedAt:    updatedAt,
		})
		noteIDs = append(noteIDs, id)
		if len(summaries) >= limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	if query.Unplaced || len(noteIDs) == 0 {
		return summaries, nil
	}

	placementsByNote, err := loadLivePlacementsByNoteIDsTx(ctx, tx, noteIDs)
	if err != nil {
		return nil, err
	}
	for i := range summaries {
		placements := placementsByNote[summaries[i].ID]
		summaries[i].PlacementCount = len(placements)
		if len(placements) == 0 {
			continue
		}
		seen := make(map[string]bool, len(placements))
		workspaceIDs := make([]string, 0, len(placements))
		for _, placement := range placements {
			if !seen[placement.workspaceID] {
				seen[placement.workspaceID] = true
				workspaceIDs = append(workspaceIDs, placement.workspaceID)
			}
		}
		summaries[i].WorkspaceIDs = workspaceIDs
	}
	return summaries, nil
}

func getNoteInfoTx(ctx context.Context, tx sqlite.DBTX, targetID string) (domain.NoteInfo, error) {
	if _, err := getNoteTx(ctx, tx, targetID); err != nil {
		return domain.NoteInfo{}, err
	}
	placementsMap, err := loadLivePlacementsByNoteIDsTx(ctx, tx, []string{targetID})
	if err != nil {
		return domain.NoteInfo{}, err
	}
	targetRows := placementsMap[targetID]
	placements := make([]domain.NotePlacementInfo, 0, len(targetRows))
	for _, row := range targetRows {
		placements = append(placements, domain.NotePlacementInfo{
			InstanceID:     row.instanceID,
			WorkspaceID:    row.workspaceID,
			WorkspaceTitle: row.workspaceTitle,
			ElementID:      row.elementID,
			Compact:        row.compact,
		})
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT id, document_state
		FROM canvas_notes
		WHERE id <> ? AND deleted_at IS NULL
		  AND (instr(document_state, ?) > 0 OR instr(document_state, ?) > 0)
		ORDER BY updated_at DESC, id ASC`, targetID, targetID, url.QueryEscape(targetID))
	if err != nil {
		return domain.NoteInfo{}, err
	}
	defer func() { _ = rows.Close() }()
	backlinks := []domain.NoteBacklinkInfo{}
	refNoteIDs := []string{}
	seenRefNotes := map[string]bool{}
	for rows.Next() {
		var refID, docStr string
		if err := rows.Scan(&refID, &docStr); err != nil {
			return domain.NoteInfo{}, err
		}
		label, kinds := domain.ExtractBacklinkInfo(json.RawMessage(docStr), targetID)
		if len(kinds) == 0 {
			continue
		}
		if !seenRefNotes[refID] {
			seenRefNotes[refID] = true
			refNoteIDs = append(refNoteIDs, refID)
		}
		for _, kind := range kinds {
			backlinks = append(backlinks, domain.NoteBacklinkInfo{
				NoteID: refID,
				Label:  label,
				Kind:   kind,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return domain.NoteInfo{}, err
	}
	if err := rows.Close(); err != nil {
		return domain.NoteInfo{}, err
	}

	if len(refNoteIDs) > 0 {
		refPlacements, err := loadLivePlacementsByNoteIDsTx(ctx, tx, refNoteIDs)
		if err != nil {
			return domain.NoteInfo{}, err
		}
		for i := range backlinks {
			if list := refPlacements[backlinks[i].NoteID]; len(list) > 0 {
				backlinks[i].WorkspaceID = list[0].workspaceID
				backlinks[i].WorkspaceTitle = list[0].workspaceTitle
			}
		}
	}

	return domain.NoteInfo{
		NoteID:     targetID,
		Placements: placements,
		Backlinks:  backlinks,
	}, nil
}
