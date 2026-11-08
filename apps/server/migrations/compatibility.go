package migrations

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
)

// These exact 0025 variants were already applied by local Notespace builds.
// Keep their history readable and perform the current payload scrub in 0026.
var legacyMigrationChecksums = map[string]map[string]struct{}{
	"0025_remove_notes.sql": {
		"a720ac182f7ca06542bd4a91b64827f3d7525d75f5b3d6193e36684dbc8d4c41": {},
		"724761d1d59d36738f264fd3fe257d8f686b26909178e63c91b7aa599d90d7fb": {},
		"1b90d2215c58c5f0bed78e3eaa1a09daeaff0375d57f9c1f0f76c6f273090a9a": {},
	},
}

func migrationChecksumMatches(name, recorded string, contents []byte) bool {
	if recorded == checksum(contents) {
		return true
	}
	// Git may change SQL line endings when checking out on another platform.
	// Accept only the exact LF/CRLF encodings; preserve recorded history and
	// continue rejecting changes to SQL content or other whitespace.
	lf := bytes.ReplaceAll(contents, []byte("\r\n"), []byte("\n"))
	if recorded == checksum(lf) || recorded == checksum(bytes.ReplaceAll(lf, []byte("\n"), []byte("\r\n"))) {
		return true
	}
	_, ok := legacyMigrationChecksums[name][recorded]
	return ok
}

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
	known := make(map[string][]byte, len(names))
	for _, name := range names {
		content, err := files.ReadFile(name)
		if err != nil {
			return Inspection{}, err
		}
		known[name] = content
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
		if recorded.Valid && recorded.String != "" && !migrationChecksumMatches(name, recorded.String, want) {
			rows.Close()
			return Inspection{}, fmt.Errorf("migration %s checksum changed: recorded %s, embedded %s", name, recorded.String, checksum(want))
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
