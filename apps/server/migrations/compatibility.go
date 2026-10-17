package migrations

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
)

// Inspection describes whether the existing library needs a schema change.
// Inspect only reads the database: an older binary must reject unknown schema
// versions before ensureMetadata or another migration changes anything.
type Inspection struct {
	NeedsMigration bool
}

func Inspect(ctx context.Context, db *sql.DB) (Inspection, error) {
	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		return Inspection{}, err
	}
	sort.Strings(names)
	known := make(map[string]string, len(names))
	for _, name := range names {
		content, err := files.ReadFile(name)
		if err != nil {
			return Inspection{}, err
		}
		known[name] = checksum(content)
	}

	var metadataExists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='schema_migrations'`).Scan(&metadataExists); err != nil {
		return Inspection{}, fmt.Errorf("inspect schema metadata: %w", err)
	}
	if metadataExists == 0 {
		return Inspection{NeedsMigration: len(names) > 0}, nil
	}

	var checksumColumn int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('schema_migrations') WHERE name='checksum'`).Scan(&checksumColumn); err != nil {
		return Inspection{}, fmt.Errorf("inspect migration checksums: %w", err)
	}
	query := `SELECT name,NULL FROM schema_migrations`
	if checksumColumn > 0 {
		query = `SELECT name,checksum FROM schema_migrations`
	}
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return Inspection{}, fmt.Errorf("read recorded migrations: %w", err)
	}
	applied := make(map[string]bool, len(names))
	for rows.Next() {
		var name string
		var recorded sql.NullString
		if err := rows.Scan(&name, &recorded); err != nil {
			rows.Close()
			return Inspection{}, err
		}
		want, ok := known[name]
		if !ok {
			rows.Close()
			return Inspection{}, fmt.Errorf("unsupported database schema: migration %q is unknown to this Notespace version; use a newer application", name)
		}
		if recorded.Valid && recorded.String != "" && recorded.String != want {
			rows.Close()
			return Inspection{}, fmt.Errorf("migration %s checksum changed: recorded %s, embedded %s", name, recorded.String, want)
		}
		applied[name] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return Inspection{}, err
	}
	if err := rows.Close(); err != nil {
		return Inspection{}, err
	}

	var stateExists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='schema_state'`).Scan(&stateExists); err != nil {
		return Inspection{}, err
	}
	if stateExists > 0 {
		if err := verifyStoredFingerprint(ctx, db); err != nil {
			return Inspection{}, err
		}
	}

	// Applied migrations must be a prefix of the embedded manifest. Missing
	// earlier steps followed by later ones indicates an unsupported schema.
	missing := false
	for _, name := range names {
		if !applied[name] {
			missing = true
		} else if missing {
			return Inspection{}, fmt.Errorf("inconsistent schema history: migration %q is applied after a missing predecessor", name)
		}
	}
	return Inspection{NeedsMigration: missing}, nil
}
