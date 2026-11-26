package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/legacynote"
)

// convertNotesToMarkdownTx runs inside the 0033 migration transaction. It
// rewrites every retired rich document as Markdown, keeps the original in
// canvas_note_legacy_documents, and verifies the result before returning, so any
// failure rolls the whole migration back and startup stops naming the Note.
func convertNotesToMarkdownTx(ctx context.Context, tx *sql.Tx) error {
	type legacy struct{ id, document string }
	rows, err := tx.QueryContext(ctx, `SELECT id,document_state FROM canvas_notes ORDER BY id`)
	if err != nil {
		return err
	}
	var total int
	var pending []legacy
	for rows.Next() {
		var id, document string
		if err := rows.Scan(&id, &document); err != nil {
			_ = rows.Close()
			return err
		}
		total++
		if legacynote.IsLegacy(json.RawMessage(document)) {
			pending = append(pending, legacy{id, document})
		} else if _, _, err := legacynote.Upgrade(json.RawMessage(document)); err != nil {
			_ = rows.Close()
			return fmt.Errorf("note %s has an unrecognised document: %w", id, err)
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	migratedAt := time.Now().UTC().Format(time.RFC3339Nano)
	simplified := 0
	for _, note := range pending {
		converted, report, err := legacynote.Upgrade(json.RawMessage(note.document))
		if err != nil {
			return fmt.Errorf("note %s cannot be converted to Markdown: %w", note.id, err)
		}
		if _, err := domain.ParseDocument(converted); err != nil {
			return fmt.Errorf("note %s converted to an invalid Markdown document", note.id)
		}
		degraded, _ := json.Marshal(append([]string{}, report.Degraded...))
		if len(report.Degraded) > 0 {
			simplified++
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO canvas_note_legacy_documents(note_id,document_state,degraded,migrated_at) VALUES (?,?,?,?)`,
			note.id, note.document, string(degraded), migratedAt); err != nil {
			return err
		}
		// The revision moves forward so an editor holding the old document gets a
		// conflict instead of overwriting the converted text.
		if _, err := tx.ExecContext(ctx,
			`UPDATE canvas_notes SET document_state=?,revision=revision+1 WHERE id=?`,
			string(converted), note.id); err != nil {
			return err
		}
	}

	var remaining, after, snapshots int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_notes WHERE COALESCE(json_extract(document_state,'$.type'),'')<>'markdown'`).Scan(&remaining); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_notes`).Scan(&after); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_legacy_documents`).Scan(&snapshots); err != nil {
		return err
	}
	if remaining != 0 || after != total || snapshots != len(pending) {
		return fmt.Errorf("Markdown conversion verification failed: %d non-Markdown, %d/%d Notes kept, %d/%d originals saved", remaining, after, total, snapshots, len(pending))
	}
	if len(pending) > 0 {
		slog.Info("rich Notes converted to Markdown", "converted", len(pending), "withSimplifiedFormatting", simplified, "total", total)
	}
	return nil
}

// upgradeLegacyNotes converts retired rich documents in a backup before any
// restore step runs, so an unconvertible archive is rejected untouched.
func upgradeLegacyNotes(notes []domain.Note) ([]domain.Note, error) {
	out := make([]domain.Note, len(notes))
	for i, note := range notes {
		document, _, err := legacynote.Upgrade(note.Document)
		if err != nil {
			return nil, domain.ErrNoteInvalid
		}
		note.Document = document
		out[i] = note
	}
	return out, nil
}
