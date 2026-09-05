package persistence

import (
	"bytes"
	"compress/zlib"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/internal/study"
	"github.com/howlil/notespace/apps/server/migrations"
	_ "modernc.org/sqlite"
)

type Store struct{ db *sql.DB }

func Open(ctx context.Context, path string) (*Store, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(absolute), 0700); err != nil {
		return nil, err
	}
	dsn := filepath.ToSlash(absolute) + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(FULL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err = db.PingContext(ctx); err == nil {
		err = migrations.Run(ctx, db)
	}
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error                      { return s.db.Close() }
func (s *Store) Healthy(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) CreateCategory(ctx context.Context, category project.CategorySummary) error {
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`,
		category.ID,
		category.Title,
		category.CreatedAt,
		category.UpdatedAt,
	)
	return err
}

func (s *Store) UpdateCategory(ctx context.Context, id, title string) (project.CategorySummary, error) {
	var category project.CategorySummary
	err := s.db.QueryRowContext(ctx, `UPDATE categories SET title=?,updated_at=? WHERE id=? RETURNING id,title,created_at,updated_at`, title, time.Now().UTC().Format(time.RFC3339Nano), id).Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return category, project.ErrNotFound
	}
	if err != nil {
		return category, err
	}
	return category, nil
}

func (s *Store) DeleteCategory(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return project.ErrNotFound
	}
	var workspaces int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE category_id=?`, id).Scan(&workspaces); err != nil {
		return err
	}
	if workspaces > 0 {
		return project.ErrNotEmpty
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM categories WHERE id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ListCategories(ctx context.Context) ([]project.CategorySummary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(p.id) FROM categories c LEFT JOIN projects p ON p.category_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC,c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []project.CategorySummary{}
	for rows.Next() {
		var category project.CategorySummary
		if err := rows.Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt, &category.WorkspaceCount); err != nil {
			return nil, err
		}
		out = append(out, category)
	}
	return out, rows.Err()
}

func (s *Store) CategoryExists(ctx context.Context, id string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&count)
	return count > 0, err
}

func (s *Store) Create(ctx context.Context, p project.Project) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	doc, _ := json.Marshal(p.Document)
	notes, _ := json.Marshal(p.Notes)
	canvas, _ := json.Marshal(p.Canvas)
	references, _ := json.Marshal(p.References)
	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO projects(id,category_id,title,document_state,canvas_state,references_state,notes_state,split_ratio,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		p.ID, p.CategoryID, p.Title, string(doc), string(canvas), string(references), string(notes),
		p.SplitRatio, p.CreatedAt, p.UpdatedAt, p.Version,
	)
	if err != nil {
		return err
	}
	if err := createHistory(ctx, tx, project.HistorySnapshot{
		HistoryEntry: project.HistoryEntry{ID: rand.Text(), WorkspaceID: p.ID, Version: p.Version, Title: p.Title, CreatedAt: p.CreatedAt},
		Document:     p.Document, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) List(ctx context.Context) ([]project.Summary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,category_id,title,created_at,updated_at,version FROM projects ORDER BY updated_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []project.Summary{}
	for rows.Next() {
		var p project.Summary
		if err := rows.Scan(
			&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListRecent(ctx context.Context, limit int) ([]project.Summary, error) {
	if limit < 1 || limit > 100 {
		limit = 12
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,category_id,title,created_at,updated_at,version FROM projects ORDER BY updated_at DESC,id LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []project.Summary{}
	for rows.Next() {
		var p project.Summary
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListCategoryWorkspaces(ctx context.Context, categoryID, query, sortBy, hasCanvas, hasNotes string, offset, limit int) (project.WorkspacePage, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	orderBy := "p.updated_at DESC, p.id"
	switch sortBy {
	case "created":
		orderBy = "p.created_at DESC, p.id"
	case "name":
		orderBy = "p.title COLLATE NOCASE ASC, p.id"
	case "notes":
		orderBy = "json_array_length(p.notes_state) DESC, p.updated_at DESC, p.id"
	}
	conditions := []string{"1=1"}
	args := []any{}
	if strings.TrimSpace(categoryID) != "" {
		conditions = append(conditions, "p.category_id=?")
		args = append(args, categoryID)
	}
	if strings.TrimSpace(query) != "" {
		conditions = append(conditions, "LOWER(p.title) LIKE ?")
		args = append(args, "%"+strings.ToLower(strings.TrimSpace(query))+"%")
	}
	if hasCanvas == "true" || hasCanvas == "1" {
		conditions = append(conditions, "json_array_length(COALESCE(json_extract(p.canvas_state, '$.elements'), '[]')) > 0")
	}
	if hasNotes == "true" || hasNotes == "1" {
		conditions = append(conditions, "json_array_length(COALESCE(json_extract(p.notes_state, '$'), '[]')) > 0")
	}
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects p WHERE `+where, args...).Scan(&total); err != nil {
		return project.WorkspacePage{}, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,json_array_length(COALESCE(json_extract(p.notes_state, '$'), '[]')),(json_array_length(COALESCE(json_extract(p.canvas_state, '$.elements'), '[]')) > 0) FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return project.WorkspacePage{}, err
	}
	defer rows.Close()
	items := make([]project.Summary, 0)
	for rows.Next() {
		var item project.Summary
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.CreatedAt, &item.UpdatedAt, &item.Version, &item.NoteCount, &item.HasCanvas); err != nil {
			return project.WorkspacePage{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return project.WorkspacePage{}, err
	}
	page := project.WorkspacePage{Items: items, Total: total, Offset: offset, Limit: limit}
	if offset+len(items) < total {
		next := offset + len(items)
		page.NextOffset = &next
	}
	return page, nil
}

func (s *Store) Move(ctx context.Context, id, categoryID string) (project.Project, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return project.Project{}, err
	}
	defer tx.Rollback()
	var categoryExists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, categoryID).Scan(&categoryExists); err != nil {
		return project.Project{}, err
	}
	if categoryExists == 0 {
		return project.Project{}, project.ErrNotFound
	}
	moved, err := readProject(tx.QueryRowContext(ctx, `UPDATE projects SET category_id=?,updated_at=? WHERE id=? RETURNING `+columns,
		categoryID, time.Now().UTC().Format(time.RFC3339Nano), id))
	if err != nil {
		return project.Project{}, err
	}
	if err := tx.Commit(); err != nil {
		return project.Project{}, err
	}
	return moved, nil
}

type scanner interface{ Scan(...any) error }

func readProject(row scanner) (project.Project, error) {
	var p project.Project
	var doc, canvas, references, notes string
	err := row.Scan(
		&p.ID, &p.CategoryID, &p.Title, &doc, &canvas, &references, &notes,
		&p.SplitRatio, &p.CreatedAt, &p.UpdatedAt, &p.Version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return p, project.ErrNotFound
	}
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal([]byte(doc), &p.Document); err != nil {
		return p, fmt.Errorf("decode document: %w", err)
	}
	if err = json.Unmarshal([]byte(notes), &p.Notes); err != nil {
		return p, fmt.Errorf("decode notes: %w", err)
	}
	if len(p.Notes) == 0 {
		p.Notes = []project.Note{{ID: p.ID + "-default", Title: "Untitled", Document: p.Document, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt}}
	}
	if err = json.Unmarshal([]byte(canvas), &p.Canvas); err != nil {
		return p, fmt.Errorf("decode canvas: %w", err)
	}
	if err = json.Unmarshal([]byte(references), &p.References); err != nil {
		return p, fmt.Errorf("decode references: %w", err)
	}
	return p, nil
}

const columns = `id,category_id,title,document_state,canvas_state,references_state,notes_state,split_ratio,created_at,updated_at,version`

func (s *Store) Get(ctx context.Context, id string) (project.Project, error) {
	return readProject(s.db.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
}

func (s *Store) Update(ctx context.Context, id string, u project.Update) (project.Project, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return project.Project{}, err
	}
	defer tx.Rollback()
	_, err = readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return project.Project{}, err
	}
	doc, _ := json.Marshal(u.Document)
	notes, _ := json.Marshal(u.Notes)
	canvas, _ := json.Marshal(u.Canvas)
	references, _ := json.Marshal(u.References)
	// Compare-and-swap prevents stale tabs or delayed requests from overwriting newer content.
	p, err := readProject(tx.QueryRowContext(ctx, `UPDATE projects SET title=?,document_state=?,canvas_state=?,references_state=?,notes_state=?,split_ratio=?,updated_at=?,version=version+1 WHERE id=? AND version=? RETURNING `+columns,
		u.Title, string(doc), string(canvas), string(references), string(notes), u.SplitRatio, time.Now().UTC().Format(time.RFC3339Nano), id, u.Version))
	if errors.Is(err, project.ErrNotFound) {
		_ = tx.Rollback()
		if _, getErr := s.Get(ctx, id); getErr != nil {
			return p, getErr
		}
		return p, project.ErrConflict
	}
	if err != nil {
		return p, err
	}
	now := time.Now().UTC()
	currentSnapshot := project.HistorySnapshot{HistoryEntry: project.HistoryEntry{ID: rand.Text(), WorkspaceID: p.ID, Version: p.Version, Title: p.Title, CreatedAt: now.Format(time.RFC3339Nano)}, Document: p.Document, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio}
	checkpoint, err := shouldCreateHistory(ctx, tx, currentSnapshot, now)
	if err != nil {
		return project.Project{}, err
	}
	if checkpoint {
		if err := createHistory(ctx, tx, currentSnapshot); err != nil {
			return project.Project{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return project.Project{}, err
	}
	return p, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_history WHERE workspace_id=?`, id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM projects WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return project.ErrNotFound
	}
	return tx.Commit()
}

func (s *Store) Search(ctx context.Context, query string) ([]project.SearchResult, error) {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return []project.SearchResult{}, nil
	}
	projects, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	categories, err := s.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	results := make([]project.SearchResult, 0)
	for _, category := range categories {
		if strings.Contains(strings.ToLower(category.Title), query) {
			results = append(results, project.SearchResult{Type: "category", CategoryID: category.ID, CategoryTitle: category.Title, Excerpt: category.Title})
		}
	}
	for _, summary := range projects {
		p, err := s.Get(ctx, summary.ID)
		if err != nil {
			return nil, err
		}
		categoryTitle := ""
		for _, category := range categories {
			if category.ID == p.CategoryID {
				categoryTitle = category.Title
				break
			}
		}
		if strings.Contains(strings.ToLower(p.Title), query) {
			results = append(results, project.SearchResult{Type: "workspace", CategoryID: p.CategoryID, CategoryTitle: categoryTitle, WorkspaceID: p.ID, WorkspaceTitle: p.Title, Excerpt: p.Title})
		}
		for _, note := range p.Notes {
			base := project.SearchResult{Type: "note", CategoryID: p.CategoryID, CategoryTitle: categoryTitle, WorkspaceID: p.ID, WorkspaceTitle: p.Title, NoteID: note.ID, NoteTitle: note.Title}
			if strings.Contains(strings.ToLower(note.Title), query) {
				base.Excerpt = note.Title
				results = append(results, base)
			}
			walkSearch(note.Document.Data, func(blockID, text string) {
				if strings.Contains(strings.ToLower(text), query) {
					result := base
					result.Type = "block"
					result.BlockID = blockID
					result.Excerpt = excerpt(text, query)
					results = append(results, result)
				}
			})
		}
	}
	return results, nil
}

func walkSearch(value json.RawMessage, visit func(string, string)) {
	var node any
	if json.Unmarshal(value, &node) != nil {
		return
	}
	var walk func(any, string)
	walk = func(value any, parentBlockID string) {
		if object, ok := value.(map[string]any); ok {
			blockID := parentBlockID
			if attrs, ok := object["attrs"].(map[string]any); ok {
				if candidate, ok := attrs["blockId"].(string); ok {
					blockID = candidate
				}
			}
			if text, ok := object["text"].(string); ok {
				visit(blockID, text)
			}
			for _, child := range object {
				walk(child, blockID)
			}
			return
		}
		if list, ok := value.([]any); ok {
			for _, child := range list {
				walk(child, parentBlockID)
			}
		}
	}
	walk(node, "")
}

func excerpt(text, query string) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) <= 140 {
		return text
	}
	index := runeIndexFold(text, query)
	if index < 0 {
		return string(runes[:140]) + "…"
	}
	start := index - 55
	if start < 0 {
		start = 0
	}
	end := start + 140
	if end > len(runes) {
		end = len(runes)
	}
	return string(runes[start:end])
}

func runeIndexFold(text, query string) int {
	haystack := []rune(strings.ToLower(text))
	needle := []rune(strings.ToLower(strings.TrimSpace(query)))
	if len(needle) == 0 {
		return 0
	}
	if len(needle) > len(haystack) {
		return -1
	}
	for start := 0; start <= len(haystack)-len(needle); start++ {
		matched := true
		for offset := range needle {
			if haystack[start+offset] != needle[offset] {
				matched = false
				break
			}
		}
		if matched {
			return start
		}
	}
	return -1
}

type execContext interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

const historyCheckpointInterval = 5 * time.Minute

type historyPayload struct {
	Title      string              `json:"title"`
	Document   project.Snapshot    `json:"document"`
	Notes      []project.Note      `json:"notes"`
	Canvas     project.Snapshot    `json:"canvas"`
	References []project.Reference `json:"references"`
	SplitRatio float64             `json:"splitRatio"`
}

type authoredHistoryPayload struct {
	Title      string              `json:"title"`
	Document   project.Snapshot    `json:"document"`
	Notes      []project.Note      `json:"notes"`
	Canvas     project.Snapshot    `json:"canvas"`
	References []project.Reference `json:"references"`
}

func makeHistoryPayload(snapshot project.HistorySnapshot) historyPayload {
	return historyPayload{
		Title: snapshot.Title, Document: snapshot.Document, Notes: snapshot.Notes,
		Canvas: snapshot.Canvas, References: snapshot.References, SplitRatio: snapshot.SplitRatio,
	}
}

func historyAuthoredHash(snapshot project.HistorySnapshot) (string, error) {
	raw, err := json.Marshal(authoredHistoryPayload{
		Title: snapshot.Title, Document: snapshot.Document, Notes: snapshot.Notes,
		Canvas: snapshot.Canvas, References: snapshot.References,
	})
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

func encodeHistoryPayload(snapshot project.HistorySnapshot) ([]byte, string, error) {
	raw, err := json.Marshal(makeHistoryPayload(snapshot))
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
	hash, err := historyAuthoredHash(snapshot)
	if err != nil {
		return nil, "", err
	}
	return compressed.Bytes(), hash, nil
}

func decodeHistoryPayload(codec string, payload []byte, snapshot *project.HistorySnapshot) error {
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
	var decoded historyPayload
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

func createHistory(ctx context.Context, db execContext, snapshot project.HistorySnapshot) error {
	payload, hash, err := encodeHistoryPayload(snapshot)
	if err != nil {
		return err
	}
	// 0006 columns are retained as a legacy read path. New rows use compact
	// placeholders there and put the complete snapshot in the compressed side table.
	_, err = db.ExecContext(ctx, `INSERT INTO workspace_history(id,workspace_id,version,title,document_state,notes_state,canvas_state,references_state,split_ratio,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, snapshot.ID, snapshot.WorkspaceID, snapshot.Version, snapshot.Title, `{}`, `{}`, `{}`, `{}`, snapshot.SplitRatio, snapshot.CreatedAt)
	if err != nil {
		return err
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO workspace_history_payload(history_id,content_hash,codec,payload,payload_size) VALUES (?,?,?,?,?)`, snapshot.ID, hash, "zlib-json-v1", payload, len(payload)); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `DELETE FROM workspace_history WHERE workspace_id=? AND id NOT IN (SELECT id FROM workspace_history WHERE workspace_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50)`, snapshot.WorkspaceID, snapshot.WorkspaceID)
	return err
}

func (s *Store) CreateHistory(ctx context.Context, snapshot project.HistorySnapshot) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := createHistory(ctx, tx, snapshot); err != nil {
		return err
	}
	return tx.Commit()
}

type latestHistory struct {
	CreatedAt string
	Hash      string
}

func latestHistoryFor(ctx context.Context, db queryer, workspaceID string) (latestHistory, bool, error) {
	var latest latestHistory
	var hash sql.NullString
	var title string
	var document, notes, canvas, references string
	var splitRatio float64
	err := db.QueryRowContext(ctx, `SELECT h.created_at, p.content_hash, h.title, h.document_state, h.notes_state, h.canvas_state, h.references_state, h.split_ratio FROM workspace_history h LEFT JOIN workspace_history_payload p ON p.history_id=h.id WHERE h.workspace_id=? ORDER BY h.created_at DESC, h.rowid DESC LIMIT 1`, workspaceID).Scan(&latest.CreatedAt, &hash, &title, &document, &notes, &canvas, &references, &splitRatio)
	if errors.Is(err, sql.ErrNoRows) {
		return latest, false, nil
	}
	if err != nil {
		return latest, false, err
	}
	if hash.Valid && hash.String != "" {
		latest.Hash = hash.String
		return latest, true, nil
	}
	legacy := project.HistorySnapshot{HistoryEntry: project.HistoryEntry{Title: title}, SplitRatio: splitRatio}
	if err := json.Unmarshal([]byte(document), &legacy.Document); err != nil {
		return latest, false, err
	}
	if err := json.Unmarshal([]byte(notes), &legacy.Notes); err != nil {
		return latest, false, err
	}
	if err := json.Unmarshal([]byte(canvas), &legacy.Canvas); err != nil {
		return latest, false, err
	}
	if err := json.Unmarshal([]byte(references), &legacy.References); err != nil {
		return latest, false, err
	}
	latest.Hash, err = historyAuthoredHash(legacy)
	return latest, true, err
}

type queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func shouldCreateHistory(ctx context.Context, db queryer, previous project.HistorySnapshot, now time.Time) (bool, error) {
	latest, found, err := latestHistoryFor(ctx, db, previous.WorkspaceID)
	if err != nil {
		return false, err
	}
	if !found {
		return true, nil
	}
	createdAt, parseErr := time.Parse(time.RFC3339Nano, latest.CreatedAt)
	if parseErr == nil && now.Before(createdAt.Add(historyCheckpointInterval)) {
		return false, nil
	}
	previousHash, err := historyAuthoredHash(previous)
	if err != nil {
		return false, err
	}
	if previousHash == latest.Hash {
		return false, nil
	}
	return true, nil
}

func (s *Store) ListHistory(ctx context.Context, workspaceID string) ([]project.HistoryEntry, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,workspace_id,version,title,created_at FROM workspace_history WHERE workspace_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []project.HistoryEntry{}
	for rows.Next() {
		var entry project.HistoryEntry
		if err := rows.Scan(&entry.ID, &entry.WorkspaceID, &entry.Version, &entry.Title, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (s *Store) GetHistory(ctx context.Context, workspaceID, historyID string) (project.HistorySnapshot, error) {
	var snapshot project.HistorySnapshot
	var document, notes, canvas, references string
	var codec sql.NullString
	var payload []byte
	err := s.db.QueryRowContext(ctx, `SELECT h.id,h.workspace_id,h.version,h.title,h.document_state,h.notes_state,h.canvas_state,h.references_state,h.split_ratio,h.created_at,p.codec,p.payload FROM workspace_history h LEFT JOIN workspace_history_payload p ON p.history_id=h.id WHERE h.workspace_id=? AND h.id=?`, workspaceID, historyID).Scan(&snapshot.ID, &snapshot.WorkspaceID, &snapshot.Version, &snapshot.Title, &document, &notes, &canvas, &references, &snapshot.SplitRatio, &snapshot.CreatedAt, &codec, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return snapshot, project.ErrNotFound
	}
	if err != nil {
		return snapshot, err
	}
	if codec.Valid && len(payload) > 0 {
		if err := decodeHistoryPayload(codec.String, payload, &snapshot); err != nil {
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

func scanStudySession(row scanner) (study.Session, error) {
	var session study.Session
	var endedAt sql.NullString
	err := row.Scan(&session.ID, &session.WorkspaceID, &session.WorkspaceTitleSnapshot, &session.ActivityDate, &session.StartedAt, &endedAt, &session.ActiveSeconds, &session.LastHeartbeatAt)
	if errors.Is(err, sql.ErrNoRows) {
		return session, study.ErrNotFound
	}
	if err != nil {
		return session, err
	}
	if endedAt.Valid {
		session.EndedAt = &endedAt.String
	}
	return session, nil
}

const studyColumns = `id,workspace_id,workspace_title_snapshot,activity_date,started_at,ended_at,active_seconds,last_heartbeat_at`

func (s *Store) UpsertSession(ctx context.Context, session study.Session) (study.Session, error) {
	var endedAt any
	if session.EndedAt != nil {
		endedAt = *session.EndedAt
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO study_sessions(`+studyColumns+`) VALUES (?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET active_seconds=MAX(study_sessions.active_seconds,excluded.active_seconds),
  ended_at=COALESCE(study_sessions.ended_at,excluded.ended_at),
  last_heartbeat_at=MAX(study_sessions.last_heartbeat_at,excluded.last_heartbeat_at)
WHERE study_sessions.workspace_id=excluded.workspace_id`, session.ID, session.WorkspaceID, session.WorkspaceTitleSnapshot, session.ActivityDate, session.StartedAt, endedAt, session.ActiveSeconds, session.LastHeartbeatAt)
	if err != nil {
		return study.Session{}, err
	}
	return scanStudySession(s.db.QueryRowContext(ctx, `SELECT `+studyColumns+` FROM study_sessions WHERE id=? AND workspace_id=?`, session.ID, session.WorkspaceID))
}

func (s *Store) WorkspaceStats(ctx context.Context, workspaceID, activityDate string) (study.WorkspaceStats, error) {
	var stats study.WorkspaceStats
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN activity_date=? THEN active_seconds ELSE 0 END),0), COALESCE(SUM(active_seconds),0) FROM study_sessions WHERE workspace_id=?`, activityDate, workspaceID).Scan(&stats.TodaySeconds, &stats.TotalSeconds)
	return stats, err
}

func (s *Store) Activity(ctx context.Context, from, to string) (study.Activity, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT activity_date,COALESCE(SUM(active_seconds),0) FROM study_sessions WHERE activity_date BETWEEN ? AND ? GROUP BY activity_date ORDER BY activity_date`, from, to)
	if err != nil {
		return study.Activity{}, err
	}
	defer rows.Close()
	byDate := map[string]int64{}
	for rows.Next() {
		var date string
		var seconds int64
		if err := rows.Scan(&date, &seconds); err != nil {
			return study.Activity{}, err
		}
		byDate[date] = seconds
	}
	if err := rows.Err(); err != nil {
		return study.Activity{}, err
	}
	start, _ := time.Parse(study.DateLayout, from)
	end, _ := time.Parse(study.DateLayout, to)
	days := make([]study.DayActivity, 0)
	for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
		key := date.Format(study.DateLayout)
		days = append(days, study.DayActivity{Date: key, ActiveSeconds: byDate[key]})
	}
	weekStart := end.AddDate(0, 0, -((int(end.Weekday()) + 6) % 7))
	var weekSeconds, todaySeconds int64
	err = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN activity_date BETWEEN ? AND ? THEN active_seconds ELSE 0 END),0), COALESCE(SUM(CASE WHEN activity_date=? THEN active_seconds ELSE 0 END),0) FROM study_sessions WHERE activity_date BETWEEN ? AND ?`, weekStart.Format(study.DateLayout), to, to, from, to).Scan(&weekSeconds, &todaySeconds)
	if err != nil {
		return study.Activity{}, err
	}
	return study.Activity{TodaySeconds: todaySeconds, WeekSeconds: weekSeconds, CurrentStreak: study.CalculateStreak(days, to), Days: days}, nil
}

func (s *Store) DayDetail(ctx context.Context, date string) (study.DayDetail, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT s.workspace_id,COALESCE(p.title,s.workspace_title_snapshot),CASE WHEN p.id IS NULL THEN 1 ELSE 0 END,COALESCE(SUM(s.active_seconds),0) FROM study_sessions s LEFT JOIN projects p ON p.id=s.workspace_id WHERE s.activity_date=? GROUP BY s.workspace_id,COALESCE(p.title,s.workspace_title_snapshot),p.id ORDER BY SUM(s.active_seconds) DESC,s.workspace_id`, date)
	if err != nil {
		return study.DayDetail{}, err
	}
	defer rows.Close()
	detail := study.DayDetail{Date: date, Workspaces: []study.WorkspaceBreakdown{}}
	for rows.Next() {
		var item study.WorkspaceBreakdown
		var deleted int
		if err := rows.Scan(&item.WorkspaceID, &item.Title, &deleted, &item.ActiveSeconds); err != nil {
			return study.DayDetail{}, err
		}
		item.Deleted = deleted == 1
		detail.ActiveSeconds += item.ActiveSeconds
		detail.Workspaces = append(detail.Workspaces, item)
	}
	return detail, rows.Err()
}
