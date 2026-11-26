package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
)

func (s *Store) ListTags(ctx context.Context) ([]domain.Tag, error) {
	tags := []domain.Tag{}
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, `SELECT id,name,normalized_key,created_at,updated_at FROM tags ORDER BY normalized_key ASC, id ASC`)
		if err != nil {
			return err
		}
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var tag domain.Tag
			if err := rows.Scan(&tag.ID, &tag.Name, &tag.NormalizedKey, &tag.CreatedAt, &tag.UpdatedAt); err != nil {
				return err
			}
			tags = append(tags, tag)
		}
		return rows.Err()
	})
	return tags, err
}

// CreateTag creates a tag or returns the existing tag when normalized_key matches.
func (s *Store) CreateTag(ctx context.Context, name string) (domain.Tag, error) {
	trimmed, key, err := domain.ValidateTagName(name)
	if err != nil {
		return domain.Tag{}, err
	}
	var out domain.Tag
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		existing, err := getTagByKeyTx(ctx, tx, key)
		if err == nil {
			out = existing
			return nil
		}
		if !errors.Is(err, domain.ErrTagNotFound) {
			return err
		}
		now := sqlite.NowUTC()
		created := domain.Tag{
			ID:            rand.Text(),
			Name:          trimmed,
			NormalizedKey: key,
			CreatedAt:     now,
			UpdatedAt:     now,
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO tags(id,name,normalized_key,created_at,updated_at) VALUES (?,?,?,?,?)`,
			created.ID, created.Name, created.NormalizedKey, created.CreatedAt, created.UpdatedAt,
		); err != nil {
			if sqlite.IsConstraintError(err) {
				if replay, lookupErr := getTagByKeyTx(ctx, tx, key); lookupErr == nil {
					out = replay
					return nil
				}
				return domain.ErrTagConflict
			}
			return err
		}
		out = created
		return nil
	})
	return out, err
}

func (s *Store) RenameTag(ctx context.Context, id, name string) (domain.Tag, error) {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxIDLength) {
		return domain.Tag{}, domain.ErrTagInvalid
	}
	trimmed, key, err := domain.ValidateTagName(name)
	if err != nil {
		return domain.Tag{}, err
	}
	var out domain.Tag
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		if _, err := getTagTx(ctx, tx, id); err != nil {
			return err
		}
		existing, err := getTagByKeyTx(ctx, tx, key)
		if err == nil && existing.ID != id {
			return domain.ErrTagConflict
		}
		if err != nil && !errors.Is(err, domain.ErrTagNotFound) {
			return err
		}
		now := sqlite.NowUTC()
		err = tx.QueryRowContext(ctx,
			`UPDATE tags SET name=?,normalized_key=?,updated_at=? WHERE id=? RETURNING id,name,normalized_key,created_at,updated_at`,
			trimmed, key, now, id,
		).Scan(&out.ID, &out.Name, &out.NormalizedKey, &out.CreatedAt, &out.UpdatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return domain.ErrTagNotFound
		}
		if sqlite.IsConstraintError(err) {
			return domain.ErrTagConflict
		}
		return err
	})
	return out, err
}

func (s *Store) DeleteTag(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxIDLength) {
		return domain.ErrTagInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id=?`, id)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count == 0 {
			return domain.ErrTagNotFound
		}
		return nil
	})
}

func (s *Store) AssignNoteTag(ctx context.Context, noteID, tagID string) error {
	noteID = strings.TrimSpace(noteID)
	tagID = strings.TrimSpace(tagID)
	if !domain.ValidID(noteID, domain.MaxNoteIDLength) {
		return domain.ErrNoteInvalid
	}
	if !domain.ValidID(tagID, domain.MaxIDLength) {
		return domain.ErrTagInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		note, err := getNoteTx(ctx, tx, noteID)
		if err != nil {
			return err
		}
		if note.DeletedAt != "" {
			return domain.ErrNoteTrashed
		}
		if _, err := getTagTx(ctx, tx, tagID); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO note_tags(note_id,tag_id,created_at) VALUES (?,?,?)`,
			noteID, tagID, sqlite.NowUTC(),
		)
		return err
	})
}

func (s *Store) RemoveNoteTag(ctx context.Context, noteID, tagID string) error {
	noteID = strings.TrimSpace(noteID)
	tagID = strings.TrimSpace(tagID)
	if !domain.ValidID(noteID, domain.MaxNoteIDLength) {
		return domain.ErrNoteInvalid
	}
	if !domain.ValidID(tagID, domain.MaxIDLength) {
		return domain.ErrTagInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		if _, err := getNoteTx(ctx, tx, noteID); err != nil {
			return err
		}
		if _, err := getTagTx(ctx, tx, tagID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM note_tags WHERE note_id=? AND tag_id=?`, noteID, tagID)
		return err
	})
}

func (s *Store) BatchUpdateNoteTags(ctx context.Context, req domain.BatchNoteTagsRequest) error {
	noteIDs, ok := normalizeIDList(req.NoteIDs, domain.MaxNoteIDLength)
	if !ok || len(noteIDs) == 0 {
		return domain.ErrNoteInvalid
	}
	addTagIDs, ok := normalizeIDList(req.AddTagIDs, domain.MaxIDLength)
	if !ok {
		return domain.ErrTagInvalid
	}
	removeTagIDs, ok := normalizeIDList(req.RemoveTagIDs, domain.MaxIDLength)
	if !ok {
		return domain.ErrTagInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		for _, noteID := range noteIDs {
			note, err := getNoteTx(ctx, tx, noteID)
			if err != nil {
				return err
			}
			if note.DeletedAt != "" {
				return domain.ErrNoteTrashed
			}
		}
		for _, tagID := range addTagIDs {
			if _, err := getTagTx(ctx, tx, tagID); err != nil {
				return err
			}
		}
		for _, tagID := range removeTagIDs {
			if _, err := getTagTx(ctx, tx, tagID); err != nil {
				return err
			}
		}
		now := sqlite.NowUTC()
		for _, noteID := range noteIDs {
			for _, tagID := range removeTagIDs {
				if _, err := tx.ExecContext(ctx, `DELETE FROM note_tags WHERE note_id=? AND tag_id=?`, noteID, tagID); err != nil {
					return err
				}
			}
			for _, tagID := range addTagIDs {
				if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO note_tags(note_id,tag_id,created_at) VALUES (?,?,?)`, noteID, tagID, now); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// --- internal tag SQL helpers ---

func normalizeIDList(values []string, maxLen int) ([]string, bool) {
	if len(values) == 0 {
		return nil, true
	}
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, raw := range values {
		id := strings.TrimSpace(raw)
		if !domain.ValidID(id, maxLen) {
			return nil, false
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out, true
}

func getTagTx(ctx context.Context, db sqlite.DBTX, id string) (domain.Tag, error) {
	var tag domain.Tag
	err := db.QueryRowContext(ctx, `SELECT id,name,normalized_key,created_at,updated_at FROM tags WHERE id=?`, id).
		Scan(&tag.ID, &tag.Name, &tag.NormalizedKey, &tag.CreatedAt, &tag.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Tag{}, domain.ErrTagNotFound
	}
	return tag, err
}

func getTagByKeyTx(ctx context.Context, db sqlite.DBTX, key string) (domain.Tag, error) {
	var tag domain.Tag
	err := db.QueryRowContext(ctx, `SELECT id,name,normalized_key,created_at,updated_at FROM tags WHERE normalized_key=?`, key).
		Scan(&tag.ID, &tag.Name, &tag.NormalizedKey, &tag.CreatedAt, &tag.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Tag{}, domain.ErrTagNotFound
	}
	return tag, err
}

func loadTagsByNoteIDsTx(ctx context.Context, tx sqlite.DBTX, noteIDs []string) (map[string][]domain.Tag, error) {
	result := make(map[string][]domain.Tag, len(noteIDs))
	if len(noteIDs) == 0 {
		return result, nil
	}
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
				SELECT nt.note_id, t.id, t.name, t.normalized_key, t.created_at, t.updated_at
				FROM note_tags nt
				INNER JOIN tags t ON t.id = nt.tag_id
				WHERE nt.note_id IN (`+placeholders+`)
				ORDER BY t.normalized_key ASC, t.id ASC`, args...)
			if err != nil {
				return err
			}
			defer func() { _ = rows.Close() }()
			for rows.Next() {
				var noteID string
				var tag domain.Tag
				if err := rows.Scan(&noteID, &tag.ID, &tag.Name, &tag.NormalizedKey, &tag.CreatedAt, &tag.UpdatedAt); err != nil {
					return err
				}
				result[noteID] = append(result[noteID], tag)
			}
			return rows.Err()
		}(); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func snapshotTagsTx(ctx context.Context, tx sqlite.DBTX) ([]domain.Tag, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,name,normalized_key,created_at,updated_at FROM tags ORDER BY normalized_key ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	tags := []domain.Tag{}
	for rows.Next() {
		var tag domain.Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.NormalizedKey, &tag.CreatedAt, &tag.UpdatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func snapshotNoteTagsTx(ctx context.Context, tx sqlite.DBTX) ([]domain.NoteTag, error) {
	rows, err := tx.QueryContext(ctx, `SELECT note_id,tag_id,created_at FROM note_tags ORDER BY note_id ASC, tag_id ASC`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := []domain.NoteTag{}
	for rows.Next() {
		var nt domain.NoteTag
		if err := rows.Scan(&nt.NoteID, &nt.TagID, &nt.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, nt)
	}
	return items, rows.Err()
}

func restoreTagsTx(ctx context.Context, tx sqlite.DBTX, tags []domain.Tag) error {
	for _, tag := range tags {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO tags(id,name,normalized_key,created_at,updated_at) VALUES (?,?,?,?,?)`,
			tag.ID, tag.Name, tag.NormalizedKey, tag.CreatedAt, tag.UpdatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func restoreNoteTagsTx(ctx context.Context, tx sqlite.DBTX, items []domain.NoteTag) error {
	for _, nt := range items {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO note_tags(note_id,tag_id,created_at) VALUES (?,?,?)`,
			nt.NoteID, nt.TagID, nt.CreatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}
