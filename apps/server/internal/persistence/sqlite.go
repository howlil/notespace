package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/howlil/notespace/apps/server/internal/project"
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
	doc, _ := json.Marshal(p.Document)
	notes, _ := json.Marshal(p.Notes)
	canvas, _ := json.Marshal(p.Canvas)
	references, _ := json.Marshal(p.References)
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO projects(id,category_id,title,document_state,canvas_state,references_state,notes_state,split_ratio,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		p.ID, p.CategoryID, p.Title, string(doc), string(canvas), string(references), string(notes),
		p.SplitRatio, p.CreatedAt, p.UpdatedAt, p.Version,
	)
	return err
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
	doc, _ := json.Marshal(u.Document)
	notes, _ := json.Marshal(u.Notes)
	canvas, _ := json.Marshal(u.Canvas)
	references, _ := json.Marshal(u.References)
	// Compare-and-swap prevents stale tabs or delayed requests from overwriting newer content.
	p, err := readProject(s.db.QueryRowContext(ctx, `UPDATE projects SET title=?,document_state=?,canvas_state=?,references_state=?,notes_state=?,split_ratio=?,updated_at=?,version=version+1 WHERE id=? AND version=? RETURNING `+columns,
		u.Title, string(doc), string(canvas), string(references), string(notes), u.SplitRatio, time.Now().UTC().Format(time.RFC3339Nano), id, u.Version))
	if errors.Is(err, project.ErrNotFound) {
		if _, getErr := s.Get(ctx, id); getErr != nil {
			return p, getErr
		}
		return p, project.ErrConflict
	}
	return p, err
}

func (s *Store) Delete(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM projects WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err == nil && count == 0 {
		return project.ErrNotFound
	}
	return err
}
