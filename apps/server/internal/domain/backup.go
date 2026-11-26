package domain

import "github.com/howlil/notespace/apps/server/internal/domain/apperr"

const (
	LibraryBackupFormat  = "notespace-backup"
	LibraryBackupVersion = 4
)

type WorkspaceEnvelope struct {
	Project       Workspace      `json:"project"`
	Assets        []StoredAsset  `json:"assets"`
	NoteInstances []NoteInstance `json:"noteInstances,omitempty"`
}

type TrashRecord struct {
	ID         string            `json:"id"`
	CategoryID string            `json:"categoryId"`
	Title      string            `json:"title"`
	DeletedAt  string            `json:"deletedAt"`
	Payload    WorkspaceEnvelope `json:"payload"`
}

type LibraryBackup struct {
	Format      string              `json:"format"`
	Version     int                 `json:"version"`
	GeneratedAt string              `json:"generatedAt"`
	Categories  []CategorySummary   `json:"categories"`
	Notes       []Note              `json:"notes,omitempty"`
	Workspaces  []WorkspaceEnvelope `json:"workspaces"`
	Trash       []TrashRecord       `json:"trash"`
}

func ValidateWorkspaceEnvelope(envelope WorkspaceEnvelope, categoryID string) error {
	authored := envelope.Project
	authored.CategoryID = categoryID
	if err := ValidateWorkspace(authored); err != nil {
		return apperr.Wrap(ErrBackupInvalid, err)
	}
	for _, stored := range envelope.Assets {
		if stored.ID == "" || stored.WorkspaceID != authored.ID || stored.MimeType == "" || len(stored.Data) == 0 {
			return ErrBackupInvalid
		}
		if _, err := NormalizeStoredAsset(stored); err != nil {
			return ErrBackupInvalid
		}
	}
	seenInstances := map[string]bool{}
	seenElements := map[string]bool{}
	for _, instance := range envelope.NoteInstances {
		if seenInstances[instance.ID] || seenElements[instance.ElementID] || instance.WorkspaceID != authored.ID || ValidateNoteInstance(instance, authored.ID) != nil {
			return ErrBackupInvalid
		}
		seenInstances[instance.ID] = true
		seenElements[instance.ElementID] = true
	}
	return nil
}

func ValidateLibraryBackup(value LibraryBackup) error {
	if value.Format != LibraryBackupFormat || (value.Version < 2 || value.Version > LibraryBackupVersion) {
		return ErrBackupInvalid
	}
	if len(value.Categories) == 0 {
		return ErrBackupInvalid
	}
	categoryIDs := map[string]bool{}
	for _, category := range value.Categories {
		if category.ID == "" || category.Title == "" || categoryIDs[category.ID] {
			return ErrBackupInvalid
		}
		categoryIDs[category.ID] = true
	}
	if !categoryIDs[UncategorizedCategoryID] {
		return ErrBackupInvalid
	}
	noteIDs := map[string]bool{}
	for _, n := range value.Notes {
		if noteIDs[n.ID] || ValidateNote(n) != nil {
			return ErrBackupInvalid
		}
		noteIDs[n.ID] = true
	}
	workspaceIDs := map[string]bool{}
	for _, envelope := range value.Workspaces {
		if envelope.Project.ID == "" || workspaceIDs[envelope.Project.ID] || !categoryIDs[envelope.Project.CategoryID] {
			return ErrBackupInvalid
		}
		workspaceIDs[envelope.Project.ID] = true
		if err := ValidateWorkspaceEnvelope(envelope, envelope.Project.CategoryID); err != nil {
			return err
		}
		for _, instance := range envelope.NoteInstances {
			if !noteIDs[instance.NoteID] {
				return ErrBackupInvalid
			}
		}
	}
	trashIDs := map[string]bool{}
	for _, record := range value.Trash {
		if record.ID == "" || trashIDs[record.ID] || record.Payload.Project.ID != record.ID || workspaceIDs[record.ID] {
			return ErrBackupInvalid
		}
		trashIDs[record.ID] = true
		if err := ValidateWorkspaceEnvelope(record.Payload, record.CategoryID); err != nil {
			return err
		}
		for _, instance := range record.Payload.NoteInstances {
			if !noteIDs[instance.NoteID] {
				return ErrBackupInvalid
			}
		}
	}
	return nil
}
