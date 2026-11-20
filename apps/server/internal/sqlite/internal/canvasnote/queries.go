package canvasnotequery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

const noteColumns = `id,schema_version,document_state,revision,created_at,updated_at,deleted_at`

func noteFromRow(row dbtx.Scanner) (note.Note, error) {
	var value note.Note
	var document string
	var deletedAt sql.NullString
	if err := row.Scan(&value.ID, &value.SchemaVersion, &document, &value.Revision, &value.CreatedAt, &value.UpdatedAt, &deletedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return note.Note{}, note.ErrNotFound
		}
		return note.Note{}, err
	}
	value.Document = json.RawMessage(document)
	value.DeletedAt = deletedAt.String
	return value, nil
}

func GetNote(ctx context.Context, db dbtx.DBTX, id string) (note.Note, error) {
	return noteFromRow(db.QueryRowContext(ctx, `SELECT `+noteColumns+` FROM canvas_notes WHERE id=?`, id))
}

func InsertNoteTx(ctx context.Context, tx dbtx.DBTX, value note.Note) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
		value.ID, value.SchemaVersion, string(value.Document), value.Revision, value.CreatedAt, value.UpdatedAt)
	return err
}

func UpdateNoteTx(ctx context.Context, tx dbtx.DBTX, id string, request note.UpdateRequest, updatedAt string) (note.Note, error) {
	value, err := noteFromRow(tx.QueryRowContext(ctx, `
		UPDATE canvas_notes
		SET document_state=?,revision=revision+1,updated_at=?
		WHERE id=? AND revision=? AND deleted_at IS NULL
		RETURNING `+noteColumns,
		string(request.Document), updatedAt, id, request.ExpectedRevision,
	))
	if errors.Is(err, note.ErrNotFound) {
		current, lookupErr := GetNote(ctx, tx, id)
		if errors.Is(lookupErr, note.ErrNotFound) {
			return note.Note{}, note.ErrNotFound
		}
		if lookupErr == nil && current.DeletedAt != "" {
			return note.Note{}, note.ErrNoteTrashed
		}
		return note.Note{}, note.ErrConflict
	}
	if err != nil {
		return note.Note{}, err
	}
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

// ListPlacementsTx returns every instance row that still points at a Note.
func ListPlacementsTx(ctx context.Context, tx dbtx.DBTX, noteID string) ([]note.Instance, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,workspace_id FROM canvas_note_instances WHERE note_id=?`, noteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var placements []note.Instance
	for rows.Next() {
		var value note.Instance
		if err := rows.Scan(&value.ID, &value.WorkspaceID); err != nil {
			return nil, err
		}
		placements = append(placements, value)
	}
	return placements, rows.Err()
}

// LiveInstanceIDs returns the instance IDs of a Canvas scene that still show a
// non-deleted element for the Note. Malformed scenes fail closed.
func LiveInstanceIDs(canvasData json.RawMessage, noteID string) (map[string]bool, error) {
	placements, err := note.ExtractCanvasPlacements(canvasData)
	if err != nil {
		return nil, err
	}
	live := map[string]bool{}
	for _, placement := range placements {
		if placement.NoteID == noteID && placement.InstanceID != "" {
			live[placement.InstanceID] = true
		}
	}
	return live, nil
}

// DeleteNoteTx removes the canonical Note and its unplaced instance rows.
func DeleteNoteTx(ctx context.Context, tx dbtx.DBTX, noteID string) error {
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
		return note.ErrNotFound
	}
	return nil
}

// TrashNoteTx moves an active Note to Trash. Content, revision and instance
// rows are kept so RestoreNoteTx returns it to every Canvas that placed it.
func TrashNoteTx(ctx context.Context, tx dbtx.DBTX, id, deletedAt string) error {
	result, err := tx.ExecContext(ctx, `UPDATE canvas_notes SET deleted_at=? WHERE id=? AND deleted_at IS NULL`, deletedAt, id)
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
	if _, lookupErr := GetNote(ctx, tx, id); lookupErr != nil {
		return lookupErr
	}
	return note.ErrNoteTrashed
}

// RestoreNoteTx brings a trashed Note back. It reports ErrNotFound when the
// Note is missing or already active, so a stale Trash view cannot double-restore.
func RestoreNoteTx(ctx context.Context, tx dbtx.DBTX, id string) error {
	result, err := tx.ExecContext(ctx, `UPDATE canvas_notes SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`, id)
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

// DeleteTrashedNoteTx permanently removes a Note only while it is in Trash.
func DeleteTrashedNoteTx(ctx context.Context, tx dbtx.DBTX, id string) error {
	current, err := GetNote(ctx, tx, id)
	if err != nil {
		return err
	}
	if current.DeletedAt == "" {
		return note.ErrNotFound
	}
	return DeleteNoteTx(ctx, tx, id)
}

// TrashedNote is the minimal Trash-list projection of a trashed Note.
type TrashedNote struct {
	ID             string
	Label          string
	Excerpt        string
	DeletedAt      string
	PlacementCount int
}

func ListTrashedNotesTx(ctx context.Context, tx dbtx.DBTX) ([]TrashedNote, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT n.id, n.document_state, n.deleted_at,
		  (SELECT COUNT(1) FROM canvas_note_instances i INNER JOIN projects p ON p.id = i.workspace_id WHERE i.note_id = n.id)
		FROM canvas_notes n
		WHERE n.deleted_at IS NOT NULL
		ORDER BY n.deleted_at DESC, n.id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []TrashedNote{}
	for rows.Next() {
		var item TrashedNote
		var document string
		if err := rows.Scan(&item.ID, &document, &item.DeletedAt, &item.PlacementCount); err != nil {
			return nil, err
		}
		doc := json.RawMessage(document)
		item.Label = note.ExtractFirstLine(doc)
		item.Excerpt = note.TruncateRunes(note.ExtractSearchText(doc), note.MaxExcerptRunes)
		items = append(items, item)
	}
	return items, rows.Err()
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
	created, err := GetNote(ctx, tx, noteID)
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
	placements, err := note.ExtractCanvasPlacements(canvasData)
	if err != nil {
		return err
	}
	for _, placement := range placements {
		if placement.InstanceID == "" || !note.ValidateGeometry(placement.X, placement.Y, placement.Width, placement.Height) {
			continue
		}
		var compact any
		if placement.Compact != nil {
			compact = boolInt(*placement.Compact)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE canvas_note_instances SET element_id=?,x=?,y=?,width=?,height=?,compact=COALESCE(?,compact),updated_at=? WHERE workspace_id=? AND id=? AND note_id=?`, placement.ElementID, placement.X, placement.Y, placement.Width, placement.Height, compact, updatedAt, workspaceID, placement.InstanceID, placement.NoteID); err != nil {
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

type livePlacementRow struct {
	noteID         string
	instanceID     string
	workspaceID    string
	workspaceTitle string
	elementID      string
	compact        bool
}

func loadLivePlacementsByNoteIDsTx(ctx context.Context, tx dbtx.DBTX, noteIDs []string) (map[string][]livePlacementRow, error) {
	result := make(map[string][]livePlacementRow, len(noteIDs))
	const chunkSize = 200
	for start := 0; start < len(noteIDs); start += chunkSize {
		end := start + chunkSize
		if end > len(noteIDs) {
			end = len(noteIDs)
		}
		chunk := noteIDs[start:end]
		placeholders := strings.Repeat("?,", len(chunk)-1) + "?"
		args := make([]any, len(chunk))
		for i, id := range chunk {
			args[i] = id
		}
		rows, err := tx.QueryContext(ctx, `
			SELECT i.note_id, i.id, i.workspace_id, p.title, i.element_id, i.compact
			FROM canvas_note_instances i
			INNER JOIN projects p ON p.id = i.workspace_id
			WHERE i.note_id IN (`+placeholders+`)
			ORDER BY p.updated_at DESC, i.created_at ASC, i.id ASC`, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var row livePlacementRow
			var compact int
			if err := rows.Scan(&row.noteID, &row.instanceID, &row.workspaceID, &row.workspaceTitle, &row.elementID, &compact); err != nil {
				rows.Close()
				return nil, err
			}
			row.compact = compact != 0
			result[row.noteID] = append(result[row.noteID], row)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return result, nil
}

// ListNotesTx returns Note summaries sorted by updated_at DESC, filtered by
// clean plain text (never raw ProseMirror JSON metadata) and optional unplaced state.
func ListNotesTx(ctx context.Context, tx dbtx.DBTX, query note.ListQuery) ([]note.Summary, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = note.DefaultListLimit
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
	summaries := []note.Summary{}
	noteIDs := []string{}
	for rows.Next() {
		var id, docStr, createdAt, updatedAt string
		if err := rows.Scan(&id, &docStr, &createdAt, &updatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		doc := json.RawMessage(docStr)
		plainText := note.ExtractSearchText(doc)
		label := note.ExtractFirstLine(doc)
		if filter != "" && !note.MatchesSearchQuery(plainText, filter) && !note.MatchesSearchQuery(label, filter) {
			continue
		}
		summaries = append(summaries, note.Summary{
			ID:           id,
			Label:        label,
			Excerpt:      note.TruncateRunes(plainText, note.MaxExcerptRunes),
			WorkspaceIDs: []string{},
			IsEmpty:      note.IsEmptyDocument(doc),
			CreatedAt:    createdAt,
			UpdatedAt:    updatedAt,
		})
		noteIDs = append(noteIDs, id)
		if len(summaries) >= limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

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

// GetNoteInfoTx returns live non-trashed placements and deduplicated backlinks
// for a canonical Note, returning note.ErrNotFound when the Note does not exist.
func GetNoteInfoTx(ctx context.Context, tx dbtx.DBTX, targetID string) (note.Info, error) {
	if _, err := GetNote(ctx, tx, targetID); err != nil {
		return note.Info{}, err
	}

	placementsMap, err := loadLivePlacementsByNoteIDsTx(ctx, tx, []string{targetID})
	if err != nil {
		return note.Info{}, err
	}
	targetRows := placementsMap[targetID]
	placements := make([]note.PlacementInfo, 0, len(targetRows))
	for _, row := range targetRows {
		placements = append(placements, note.PlacementInfo{
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
		ORDER BY updated_at DESC, id ASC`, targetID)
	if err != nil {
		return note.Info{}, err
	}
	backlinks := []note.BacklinkInfo{}
	refNoteIDs := []string{}
	seenRefNotes := map[string]bool{}
	for rows.Next() {
		var refID, docStr string
		if err := rows.Scan(&refID, &docStr); err != nil {
			rows.Close()
			return note.Info{}, err
		}
		doc := json.RawMessage(docStr)
		kinds := note.ExtractBacklinkKinds(doc, targetID)
		if len(kinds) == 0 {
			continue
		}
		label := note.ExtractFirstLine(doc)
		if !seenRefNotes[refID] {
			seenRefNotes[refID] = true
			refNoteIDs = append(refNoteIDs, refID)
		}
		for _, kind := range kinds {
			backlinks = append(backlinks, note.BacklinkInfo{
				NoteID: refID,
				Label:  label,
				Kind:   kind,
			})
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return note.Info{}, err
	}
	rows.Close()

	if len(refNoteIDs) > 0 {
		refPlacements, err := loadLivePlacementsByNoteIDsTx(ctx, tx, refNoteIDs)
		if err != nil {
			return note.Info{}, err
		}
		for i := range backlinks {
			if list := refPlacements[backlinks[i].NoteID]; len(list) > 0 {
				backlinks[i].WorkspaceID = list[0].workspaceID
				backlinks[i].WorkspaceTitle = list[0].workspaceTitle
			}
		}
	}

	return note.Info{
		NoteID:     targetID,
		Placements: placements,
		Backlinks:  backlinks,
	}, nil
}
