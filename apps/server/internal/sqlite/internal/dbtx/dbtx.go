// Package dbtx defines borrowed SQL access. The Store facade owns connections
// and transaction lifetime; query packages only execute statements.
package dbtx

import (
	"context"
	"database/sql"
)

type DBTX interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}
