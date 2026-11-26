package store

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
)

func syncNoteReferencesTx(ctx context.Context, tx sqlite.DBTX, sourceNoteID string, doc json.RawMessage) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM note_references WHERE source_note_id=?`, sourceNoteID); err != nil {
		return err
	}
	refs := domain.ExtractNoteReferences(doc)
	if len(refs) == 0 {
		return nil
	}
	for occ, ref := range refs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO note_references(source_note_id,target_note_id,kind,context_excerpt,occurrence_index) VALUES (?,?,?,?,?)`,
			sourceNoteID, ref.TargetNoteID, ref.Kind, ref.Excerpt, occ,
		); err != nil {
			return err
		}
	}
	return nil
}

func rebuildAllNoteReferencesTx(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM note_references`); err != nil {
		return err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,document_state FROM canvas_notes ORDER BY id`)
	if err != nil {
		return err
	}
	type noteDoc struct {
		id  string
		doc string
	}
	var notes []noteDoc
	for rows.Next() {
		var item noteDoc
		if err := rows.Scan(&item.id, &item.doc); err != nil {
			_ = rows.Close()
			return err
		}
		notes = append(notes, item)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, item := range notes {
		if err := syncNoteReferencesTx(ctx, tx, item.id, json.RawMessage(item.doc)); err != nil {
			return err
		}
	}
	return nil
}
