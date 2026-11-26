package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/archive"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite/migrations"
)

// ExportBackupArchive snapshots the entire library atomically and encodes it as
// a content-addressed portable ZIP archive.
func (s *Store) ExportBackupArchive(ctx context.Context) ([]byte, error) {
	snapshot, err := s.SnapshotLibrary(ctx)
	if err != nil {
		return nil, err
	}
	return archive.Encode(snapshot)
}

// RestoreBackupArchive decodes, validates once, and atomically replaces the
// library inside a single serialized write transaction.
func (s *Store) RestoreBackupArchive(ctx context.Context, data []byte) error {
	decoded, err := archive.Decode(data)
	if err != nil {
		return err
	}
	return s.restoreLibrary(ctx, decoded)
}

// SnapshotLibrary reads the entire library inside a single WAL read transaction
// using batch queries (no N+1 per-workspace queries).
func (s *Store) SnapshotLibrary(ctx context.Context) (domain.LibraryBackup, error) {
	var out domain.LibraryBackup
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		notes, err := snapshotNotesTx(ctx, tx)
		if err != nil {
			return err
		}
		tags, err := snapshotTagsTx(ctx, tx)
		if err != nil {
			return err
		}
		noteTags, err := snapshotNoteTagsTx(ctx, tx)
		if err != nil {
			return err
		}
		workspaces, err := snapshotAllWorkspacesTx(ctx, tx)
		if err != nil {
			return err
		}
		trash, err := listTrashRecordsTx(ctx, tx)
		if err != nil {
			return err
		}
		redirects, err := listCategoryRedirectsTx(ctx, tx)
		if err != nil {
			return err
		}
		if len(trash) > 0 {
			liveNoteIDs := make(map[string]bool, len(notes))
			for _, n := range notes {
				liveNoteIDs[n.ID] = true
			}
			for i := range trash {
				instances := trash[i].Payload.NoteInstances
				if len(instances) == 0 {
					continue
				}
				kept := make([]domain.NoteInstance, 0, len(instances))
				for _, inst := range instances {
					if liveNoteIDs[inst.NoteID] {
						kept = append(kept, inst)
					}
				}
				trash[i].Payload.NoteInstances = kept
			}
		}
		out = domain.LibraryBackup{
			Format:      domain.LibraryBackupFormat,
			Version:     domain.LibraryBackupVersion,
			GeneratedAt: sqlite.NowUTC(),
			Notes:       notes,
			Tags:        tags,
			NoteTags:    noteTags,
			Workspaces:  workspaces,
			Trash:       trash,
			Redirects:   redirects,
		}
		return nil
	})
	return out, err
}

func (s *Store) restoreLibrary(ctx context.Context, value domain.LibraryBackup) error {
	// Older archives carry rich Notes. Convert them before validation and before
	// any DELETE so an archive that cannot be converted never touches the library.
	notes, err := upgradeLegacyNotes(value.Notes)
	if err != nil {
		return err
	}
	value.Notes = notes
	if err := domain.ValidateLibraryBackup(value); err != nil {
		return err
	}
	orderedWorkspaces, err := orderWorkspacesTopologically(value.Workspaces)
	if err != nil {
		return err
	}
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		for _, stmt := range []string{
			`DELETE FROM workspace_search`,
			`DELETE FROM workspace_search_meta`,
			`DELETE FROM canvas_note_search_meta`,
			`DELETE FROM note_references`,
			`DELETE FROM note_tags`,
			`DELETE FROM tags`,
			`DELETE FROM canvas_note_create_requests`,
			`DELETE FROM canvas_note_instances`,
			`DELETE FROM canvas_notes`,
			`DELETE FROM workspace_asset_tombstones`,
			`DELETE FROM workspace_assets`,
			`DELETE FROM workspace_trash`,
			`DELETE FROM category_workspace_redirects`,
			`DELETE FROM workspace_canvas`,
			`DELETE FROM projects`,
		} {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				return err
			}
		}
		if err := restoreNotesTx(ctx, tx, value.Notes); err != nil {
			return err
		}
		if err := restoreTagsTx(ctx, tx, value.Tags); err != nil {
			return err
		}
		if err := restoreNoteTagsTx(ctx, tx, value.NoteTags); err != nil {
			return err
		}
		if err := rebuildAllNoteReferencesTx(ctx, tx); err != nil {
			return err
		}
		for _, envelope := range orderedWorkspaces {
			if err := restoreWorkspaceEnvelopeTx(ctx, tx, envelope, envelope.Project.ParentID); err != nil {
				return err
			}
		}
		for _, redirect := range value.Redirects {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO category_workspace_redirects(legacy_category_id,workspace_id) VALUES (?,?)`,
				redirect.LegacyCategoryID, redirect.WorkspaceID,
			); err != nil {
				return err
			}
		}
		for _, record := range value.Trash {
			if err := insertTrashTx(ctx, tx, record.ID, record.ParentID, record.Title, record.DeletedAt, record.Payload); err != nil {
				return err
			}
		}
		return migrations.Validate(ctx, tx)
	})
	if err != nil {
		return err
	}
	s.pagination.Invalidate()
	return nil
}

func orderWorkspacesTopologically(envelopes []domain.WorkspaceEnvelope) ([]domain.WorkspaceEnvelope, error) {
	byID := make(map[string]domain.WorkspaceEnvelope, len(envelopes))
	for _, env := range envelopes {
		byID[env.Project.ID] = env
	}
	ordered := make([]domain.WorkspaceEnvelope, 0, len(envelopes))
	state := make(map[string]uint8, len(envelopes)) // 1 = visiting, 2 = visited
	var visit func(id string) error
	visit = func(id string) error {
		switch state[id] {
		case 2:
			return nil
		case 1:
			return domain.ErrBackupInvalid
		}
		state[id] = 1
		env, ok := byID[id]
		if !ok {
			return domain.ErrBackupInvalid
		}
		if env.Project.ParentID != nil {
			if err := visit(*env.Project.ParentID); err != nil {
				return err
			}
		}
		state[id] = 2
		ordered = append(ordered, env)
		return nil
	}
	for _, env := range envelopes {
		if err := visit(env.Project.ID); err != nil {
			return nil, err
		}
	}
	return ordered, nil
}

// --- SQLite snapshot, restore & trash helpers ---

func listCategoryRedirectsTx(ctx context.Context, tx sqlite.DBTX) ([]domain.CategoryRedirect, error) {
	rows, err := tx.QueryContext(ctx, `SELECT legacy_category_id,workspace_id FROM category_workspace_redirects ORDER BY legacy_category_id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	redirects := []domain.CategoryRedirect{}
	for rows.Next() {
		var r domain.CategoryRedirect
		if err := rows.Scan(&r.LegacyCategoryID, &r.WorkspaceID); err != nil {
			return nil, err
		}
		redirects = append(redirects, r)
	}
	return redirects, rows.Err()
}

func snapshotAllWorkspacesTx(ctx context.Context, tx sqlite.DBTX) ([]domain.WorkspaceEnvelope, error) {
	wsRows, err := tx.QueryContext(ctx, `
		SELECT p.id,p.parent_id,p.title,p.created_at,p.updated_at,p.version,c.canvas_state,c.version
		FROM projects p
		JOIN workspace_canvas c ON c.workspace_id=p.id
		ORDER BY p.updated_at DESC,p.id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = wsRows.Close() }()
	envelopes := []domain.WorkspaceEnvelope{}
	indexByID := map[string]int{}
	for wsRows.Next() {
		var ws domain.Workspace
		var parent sql.NullString
		var encodedCanvas string
		if err := wsRows.Scan(&ws.ID, &parent, &ws.Title, &ws.CreatedAt, &ws.UpdatedAt, &ws.Version, &encodedCanvas, &ws.CanvasVersion); err != nil {
			return nil, err
		}
		if parent.Valid {
			val := parent.String
			ws.ParentID = &val
		}
		if err := json.Unmarshal([]byte(encodedCanvas), &ws.Canvas); err != nil {
			return nil, err
		}
		indexByID[ws.ID] = len(envelopes)
		envelopes = append(envelopes, domain.WorkspaceEnvelope{
			Project:       ws,
			Assets:        []domain.StoredAsset{},
			NoteInstances: []domain.NoteInstance{},
		})
	}
	if err := wsRows.Err(); err != nil {
		return nil, err
	}
	if err := wsRows.Close(); err != nil {
		return nil, err
	}
	if len(envelopes) == 0 {
		return envelopes, nil
	}

	assetRows, err := tx.QueryContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets ORDER BY created_at,id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = assetRows.Close() }()
	for assetRows.Next() {
		var a domain.StoredAsset
		if err := assetRows.Scan(&a.ID, &a.WorkspaceID, &a.MimeType, &a.Data, &a.CreatedAt); err != nil {
			return nil, err
		}
		if idx, ok := indexByID[a.WorkspaceID]; ok {
			envelopes[idx].Assets = append(envelopes[idx].Assets, a)
		}
	}
	if err := assetRows.Err(); err != nil {
		return nil, err
	}
	if err := assetRows.Close(); err != nil {
		return nil, err
	}

	instRows, err := tx.QueryContext(ctx, `SELECT id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at FROM canvas_note_instances ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = instRows.Close() }()
	for instRows.Next() {
		var inst domain.NoteInstance
		var compact int
		if err := instRows.Scan(&inst.ID, &inst.NoteID, &inst.WorkspaceID, &inst.ElementID, &inst.X, &inst.Y, &inst.Width, &inst.Height, &compact, &inst.CreatedAt, &inst.UpdatedAt); err != nil {
			return nil, err
		}
		inst.Compact = compact != 0
		if idx, ok := indexByID[inst.WorkspaceID]; ok {
			envelopes[idx].NoteInstances = append(envelopes[idx].NoteInstances, inst)
		}
	}
	if err := instRows.Err(); err != nil {
		return nil, err
	}
	if err := instRows.Close(); err != nil {
		return nil, err
	}
	return envelopes, nil
}

func snapshotWorkspaceEnvelopeTx(ctx context.Context, tx sqlite.DBTX, id string) (domain.WorkspaceEnvelope, error) {
	ws, err := snapshotWorkspaceRecordTx(ctx, tx, id)
	if err != nil {
		return domain.WorkspaceEnvelope{}, err
	}
	assetRows, err := tx.QueryContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? ORDER BY created_at,id`, id)
	if err != nil {
		return domain.WorkspaceEnvelope{}, err
	}
	defer func() { _ = assetRows.Close() }()
	assets := []domain.StoredAsset{}
	for assetRows.Next() {
		var a domain.StoredAsset
		if err := assetRows.Scan(&a.ID, &a.WorkspaceID, &a.MimeType, &a.Data, &a.CreatedAt); err != nil {
			return domain.WorkspaceEnvelope{}, err
		}
		assets = append(assets, a)
	}
	if err := assetRows.Err(); err != nil {
		return domain.WorkspaceEnvelope{}, err
	}
	if err := assetRows.Close(); err != nil {
		return domain.WorkspaceEnvelope{}, err
	}

	instRows, err := tx.QueryContext(ctx, `SELECT id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at FROM canvas_note_instances WHERE workspace_id=? ORDER BY id`, id)
	if err != nil {
		return domain.WorkspaceEnvelope{}, err
	}
	defer func() { _ = instRows.Close() }()
	instances := []domain.NoteInstance{}
	for instRows.Next() {
		var inst domain.NoteInstance
		var compact int
		if err := instRows.Scan(&inst.ID, &inst.NoteID, &inst.WorkspaceID, &inst.ElementID, &inst.X, &inst.Y, &inst.Width, &inst.Height, &compact, &inst.CreatedAt, &inst.UpdatedAt); err != nil {
			return domain.WorkspaceEnvelope{}, err
		}
		inst.Compact = compact != 0
		instances = append(instances, inst)
	}
	if err := instRows.Err(); err != nil {
		return domain.WorkspaceEnvelope{}, err
	}
	if err := instRows.Close(); err != nil {
		return domain.WorkspaceEnvelope{}, err
	}
	return domain.WorkspaceEnvelope{Project: ws, Assets: assets, NoteInstances: instances}, nil
}

func restoreWorkspaceEnvelopeTx(ctx context.Context, tx sqlite.DBTX, envelope domain.WorkspaceEnvelope, parentID *string) error {
	scene, err := domain.ParseScene(envelope.Project.Canvas)
	if err != nil {
		return domain.ErrWorkspaceInvalid
	}
	ws := envelope.Project
	ws.ParentID = parentID
	if err := insertWorkspaceTx(ctx, tx, ws, scene.ActiveElementCount()); err != nil {
		return err
	}
	if err := restoreAssetsTx(ctx, tx, ws.ID, envelope.Assets); err != nil {
		return err
	}
	return restoreNoteInstancesTx(ctx, tx, ws.ID, envelope.NoteInstances)
}

func snapshotNotesTx(ctx context.Context, tx sqlite.DBTX) ([]domain.Note, error) {
	rows, err := tx.QueryContext(ctx, `SELECT `+noteColumns+` FROM canvas_notes ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	values := []domain.Note{}
	for rows.Next() {
		value, err := noteFromRow(rows)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func restoreNotesTx(ctx context.Context, tx sqlite.DBTX, values []domain.Note) error {
	for _, value := range values {
		var deletedAt any
		if value.DeletedAt != "" {
			deletedAt = value.DeletedAt
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?)`,
			value.ID, value.SchemaVersion, string(value.Document), value.Revision, value.CreatedAt, value.UpdatedAt, deletedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func restoreNoteInstancesTx(ctx context.Context, tx sqlite.DBTX, workspaceID string, values []domain.NoteInstance) error {
	for _, value := range values {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO canvas_note_instances(id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM canvas_notes WHERE id=?)`,
			value.ID, value.NoteID, workspaceID, value.ElementID, value.X, value.Y, value.Width, value.Height, sqlite.BoolInt(value.Compact), value.CreatedAt, value.UpdatedAt, value.NoteID,
		); err != nil {
			return err
		}
	}
	return nil
}

func insertTrashTx(ctx context.Context, tx sqlite.DBTX, id string, parentID *string, title, deletedAt string, envelope domain.WorkspaceEnvelope) error {
	envelope.Project.ParentID = parentID
	payload, err := archive.EncodeTrashEnvelope(envelope)
	if err != nil {
		return err
	}
	var parentArg any
	if parentID != nil {
		parentArg = *parentID
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO workspace_trash(id,parent_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`, id, parentArg, title, deletedAt, payload)
	return err
}

func listTrashRecordsTx(ctx context.Context, tx sqlite.DBTX) ([]domain.TrashRecord, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,parent_id,title,deleted_at,payload FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	records := []domain.TrashRecord{}
	for rows.Next() {
		var record domain.TrashRecord
		var parent sql.NullString
		var payload []byte
		if err := rows.Scan(&record.ID, &parent, &record.Title, &record.DeletedAt, &payload); err != nil {
			return nil, err
		}
		if parent.Valid {
			val := parent.String
			record.ParentID = &val
		}
		if err := archive.DecodeTrashEnvelope(payload, &record.Payload); err != nil {
			return nil, fmt.Errorf("decode trash payload %s: %w", record.ID, err)
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func readTrashTx(ctx context.Context, tx sqlite.DBTX, id string) (domain.TrashRecord, error) {
	var record domain.TrashRecord
	var parent sql.NullString
	var payload []byte
	err := tx.QueryRowContext(ctx, `SELECT id,parent_id,title,deleted_at,payload FROM workspace_trash WHERE id=?`, id).
		Scan(&record.ID, &parent, &record.Title, &record.DeletedAt, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return record, domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return record, err
	}
	if parent.Valid {
		val := parent.String
		record.ParentID = &val
	}
	if err := archive.DecodeTrashEnvelope(payload, &record.Payload); err != nil {
		return record, fmt.Errorf("decode trash envelope: %w", err)
	}
	return record, nil
}

// --- Migration hook: retired-artifact scrubs (0026, 0031), rich Note conversion (0033), and hierarchy upgrade (0035) ---

func scrubRetiredNoteArtifactsTx(ctx context.Context, tx *sql.Tx, name string) error {
	switch name {
	case migrations.RetiredNotesMigration:
		document, err := json.Marshal(domain.CanvasSnapshot{
			Format:  "tiptap",
			Version: 1,
			Data:    json.RawMessage(`{"type":"doc","content":[]}`),
		})
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
	case migrations.ContractRetiredDomainsMigration:
		if err := scrubRetiredCanvasTx(ctx, tx); err != nil {
			return err
		}
		return scrubRetiredTrashTx(ctx, tx)
	case migrations.NoteMarkdownMigration:
		return convertNotesToMarkdownTx(ctx, tx)
	case migrations.WorkspaceHierarchyMigration:
		return verifyAndUpgradeWorkspaceHierarchyTx(ctx, tx)
	case migrations.NoteReferencesAndTagsMigration:
		return rebuildAllNoteReferencesTx(ctx, tx)
	default:
		return nil
	}
}

func scrubRetiredCanvasTx(ctx context.Context, tx *sql.Tx) error {
	lastWorkspaceID := ""
	for {
		var id, data string
		err := tx.QueryRowContext(ctx, `
SELECT workspace_id,canvas_state
FROM workspace_canvas
WHERE workspace_id > ?
ORDER BY workspace_id
LIMIT 1`, lastWorkspaceID).Scan(&id, &data)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		encoded, _, elementCount, err := scrubCanvasStateJSON(data)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_canvas SET canvas_state=?,element_count=? WHERE workspace_id=?`, encoded, elementCount, id); err != nil {
			return err
		}
		lastWorkspaceID = id
	}
}

func scrubRetiredHistoryCanvasTx(ctx context.Context, tx *sql.Tx) error {
	lastHistoryID := ""
	for {
		var id, data string
		err := tx.QueryRowContext(ctx, `
SELECT id,canvas_state
FROM workspace_history
WHERE id > ?
ORDER BY id
LIMIT 1`, lastHistoryID).Scan(&id, &data)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		lastHistoryID = id
		encoded, changed, _, err := scrubCanvasStateJSON(data)
		if err != nil {
			return err
		}
		if !changed {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_history SET canvas_state=? WHERE id=?`, encoded, id); err != nil {
			return err
		}
	}
}

func scrubRetiredTrashTx(ctx context.Context, tx *sql.Tx) error {
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
		var envelope domain.WorkspaceEnvelope
		if err := archive.DecodeTrashEnvelope(payload, &envelope); err != nil {
			return fmt.Errorf("decode trash envelope %s: %w", id, err)
		}
		canvas, _, _, err := domain.ScrubRetiredSnapshot(envelope.Project.Canvas)
		if err != nil {
			return fmt.Errorf("scrub trash envelope %s: %w", id, err)
		}
		envelope.Project.Canvas = canvas
		encoded, err := archive.EncodeTrashEnvelope(envelope)
		if err != nil {
			return fmt.Errorf("encode trash envelope %s: %w", id, err)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_trash SET payload=? WHERE id=?`, encoded, id); err != nil {
			return err
		}
		lastID = id
	}
}

func scrubCanvasStateJSON(encoded string) ([]byte, bool, int, error) {
	var snapshot domain.CanvasSnapshot
	if err := json.Unmarshal([]byte(encoded), &snapshot); err != nil {
		return nil, false, 0, err
	}
	scrubbed, changed, elementCount, err := domain.ScrubRetiredSnapshot(snapshot)
	if err != nil {
		return nil, false, 0, err
	}
	if !changed {
		return []byte(encoded), false, elementCount, nil
	}
	out, err := json.Marshal(scrubbed)
	if err != nil {
		return nil, false, 0, err
	}
	return out, true, elementCount, nil
}
