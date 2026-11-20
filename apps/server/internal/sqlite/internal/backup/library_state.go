package backupquery

import (
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/note"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const LibraryBackupFormat = "notespace-backup"
const LibraryBackupVersion = 3

type WorkspaceEnvelope struct {
	Project       workspacepkg.Workspace `json:"project"`
	Assets        []asset.Stored         `json:"assets"`
	NoteInstances []note.Instance        `json:"noteInstances,omitempty"`
}

type TrashRecord struct {
	ID         string            `json:"id"`
	CategoryID string            `json:"categoryId"`
	Title      string            `json:"title"`
	DeletedAt  string            `json:"deletedAt"`
	Payload    WorkspaceEnvelope `json:"payload"`
}

type LibraryBackup struct {
	Format      string                         `json:"format"`
	Version     int                            `json:"version"`
	GeneratedAt string                         `json:"generatedAt"`
	Categories  []workspacepkg.CategorySummary `json:"categories"`
	Notes       []note.Note                    `json:"notes,omitempty"`
	Workspaces  []WorkspaceEnvelope            `json:"workspaces"`
	Trash       []TrashRecord                  `json:"trash"`
}

func ValidateWorkspaceEnvelope(envelope WorkspaceEnvelope, categoryID string) error {
	authored := envelope.Project
	authored.CategoryID = categoryID
	if err := workspacepkg.ValidateWorkspace(authored); err != nil {
		return err
	}
	for _, stored := range envelope.Assets {
		if stored.ID == "" || stored.WorkspaceID != authored.ID || stored.MimeType == "" || len(stored.Data) == 0 {
			return workspacepkg.ErrInvalid
		}
		if err := asset.ValidateStored(stored); err != nil {
			return workspacepkg.ErrInvalid
		}
	}
	seenInstances := map[string]bool{}
	seenElements := map[string]bool{}
	for _, instance := range envelope.NoteInstances {
		if seenInstances[instance.ID] || seenElements[instance.ElementID] || instance.WorkspaceID != authored.ID || note.ValidateInstance(instance, authored.ID) != nil {
			return workspacepkg.ErrInvalid
		}
		seenInstances[instance.ID] = true
		seenElements[instance.ElementID] = true
	}
	return nil
}

func ValidateLibraryBackup(backup LibraryBackup) error {
	if backup.Format != LibraryBackupFormat || (backup.Version != 2 && backup.Version != LibraryBackupVersion) {
		return workspacepkg.ErrInvalid
	}
	if len(backup.Categories) == 0 {
		return workspacepkg.ErrInvalid
	}

	categoryIDs := map[string]bool{}
	for _, category := range backup.Categories {
		if category.ID == "" || category.Title == "" || categoryIDs[category.ID] {
			return workspacepkg.ErrInvalid
		}
		categoryIDs[category.ID] = true
	}
	if !categoryIDs[workspacepkg.UncategorizedCategoryID] {
		return workspacepkg.ErrInvalid
	}
	noteIDs := map[string]bool{}
	for _, value := range backup.Notes {
		if noteIDs[value.ID] || note.ValidateNote(value) != nil {
			return workspacepkg.ErrInvalid
		}
		noteIDs[value.ID] = true
	}

	workspaceIDs := map[string]bool{}
	for _, envelope := range backup.Workspaces {
		if envelope.Project.ID == "" || workspaceIDs[envelope.Project.ID] || !categoryIDs[envelope.Project.CategoryID] {
			return workspacepkg.ErrInvalid
		}
		workspaceIDs[envelope.Project.ID] = true
		if err := ValidateWorkspaceEnvelope(envelope, envelope.Project.CategoryID); err != nil {
			return err
		}
		for _, instance := range envelope.NoteInstances {
			if !noteIDs[instance.NoteID] {
				return workspacepkg.ErrInvalid
			}
		}
	}

	trashIDs := map[string]bool{}
	for _, record := range backup.Trash {
		if record.ID == "" || trashIDs[record.ID] || record.Payload.Project.ID != record.ID || workspaceIDs[record.ID] {
			return workspacepkg.ErrInvalid
		}
		trashIDs[record.ID] = true
		if err := ValidateWorkspaceEnvelope(record.Payload, record.CategoryID); err != nil {
			return err
		}
		for _, instance := range record.Payload.NoteInstances {
			if !noteIDs[instance.NoteID] {
				return workspacepkg.ErrInvalid
			}
		}
	}
	return nil
}
