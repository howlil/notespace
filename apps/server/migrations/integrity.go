package migrations

import (
	"context"
	"fmt"
)

// ValidateFull performs the more expensive integrity_check during an actual
// upgrade or when validating a recovery copy, not on every normal startup.
func ValidateFull(ctx context.Context, q queryContext) error {
	if err := Validate(ctx, q); err != nil {
		return err
	}
	rows, err := q.QueryContext(ctx, `PRAGMA integrity_check`)
	if err != nil {
		return fmt.Errorf("full SQLite integrity check: %w", err)
	}
	defer rows.Close()
	seen := false
	for rows.Next() {
		seen = true
		var result string
		if err := rows.Scan(&result); err != nil {
			return fmt.Errorf("full SQLite integrity check: %w", err)
		}
		if result != "ok" {
			return fmt.Errorf("full SQLite integrity check failed: %s", result)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("full SQLite integrity check: %w", err)
	}
	if !seen {
		return fmt.Errorf("full SQLite integrity check returned no result")
	}
	return nil
}
