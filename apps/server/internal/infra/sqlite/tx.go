package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	sqlite3 "modernc.org/sqlite"
)

type DBTX interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type Scanner interface {
	Scan(...any) error
}

func (d *DB) WithTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := d.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (d *DB) WithReadTx(ctx context.Context, fn func(*sql.Tx) error) error {
	pool := d.ReadPool()
	tx, err := pool.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return err
	}
	return nil
}

func IsConstraintError(err error) bool {
	var sqliteErr *sqlite3.Error
	if !errors.As(err, &sqliteErr) || sqliteErr.Code() == 0 {
		return false
	}
	switch sqliteErr.Code() {
	case 19, // SQLITE_CONSTRAINT
		1555, // SQLITE_CONSTRAINT_PRIMARYKEY
		2067, // SQLITE_CONSTRAINT_UNIQUE
		787:  // SQLITE_CONSTRAINT_FOREIGNKEY
		return true
	}
	return false
}

func ContainsLikeLiteral(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "%", `\%`)
	value = strings.ReplaceAll(value, "_", `\_`)
	return "%" + value + "%"
}

func EscapeURIPath(slashPath string) string {
	replacer := strings.NewReplacer("%", "%25", "#", "%23", "?", "%3f")
	return replacer.Replace(slashPath)
}

func BoolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func NowUTC() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
