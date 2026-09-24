package sqlite

import (
	"context"
	"encoding/json"
	"fmt"
)

func (s *Store) RestoreBackupJSON(ctx context.Context, data []byte) error {
	var backup libraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		return fmt.Errorf("decode backup: %w", err)
	}
	return s.restoreLibraryBackup(ctx, backup)
}
