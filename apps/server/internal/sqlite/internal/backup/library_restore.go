package backupquery

import (
	"strings"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/planning"
	activityquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/activity"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func ValidateLibraryBackup(backup LibraryBackup) error {
	if backup.Format != LibraryBackupFormat || (backup.Version != 1 && backup.Version != 2 && backup.Version != LibraryBackupVersion) {
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
	activeTaskIDs := map[string]bool{}
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
		for _, task := range envelope.Plan.Tasks {
			if activeTaskIDs[task.ID] {
				return workspacepkg.ErrInvalid
			}
			activeTaskIDs[task.ID] = true
		}
	}
	for _, task := range backup.Tasks {
		if planning.ValidateStandaloneTask(task) != nil || activeTaskIDs[task.ID] {
			return workspacepkg.ErrInvalid
		}
		activeTaskIDs[task.ID] = true
	}
	captureIDs := map[string]bool{}
	for _, item := range backup.Captures {
		if !capture.ValidItem(item) || captureIDs[item.ID] {
			return workspacepkg.ErrInvalid
		}
		captureIDs[item.ID] = true
	}
	activeLogicalIDs := map[string]bool{}
	for _, raw := range backup.Activity {
		session := activityquery.NormalizeActivitySession(raw)
		if err := activity.ValidateSession(session); err != nil {
			return workspacepkg.ErrInvalid
		}
		activeLogicalIDs[strings.SplitN(session.ID, ":", 2)[0]] = true
	}
	deletedIDs := map[string]bool{}
	for _, id := range backup.DeletedActivitySessionIDs {
		if id == "" || deletedIDs[id] || activeLogicalIDs[id] {
			return workspacepkg.ErrInvalid
		}
		deletedIDs[id] = true
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
			if len(backup.Notes) > 0 && !noteIDs[instance.NoteID] {
				return workspacepkg.ErrInvalid
			}
		}
	}
	return nil
}
