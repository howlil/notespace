package backupquery

import (
	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const LibraryBackupFormat = "notespace-backup"
const LibraryBackupVersion = 3

type WorkspaceEnvelope struct {
	Project       workspacepkg.Workspace         `json:"project"`
	Plan          planning.Plan                  `json:"plan,omitempty"`
	History       []workspacepkg.HistorySnapshot `json:"history"`
	Assets        []asset.Stored                 `json:"assets"`
	NoteInstances []note.Instance                `json:"noteInstances,omitempty"`
}

type TrashRecord struct {
	ID         string            `json:"id"`
	CategoryID string            `json:"categoryId"`
	Title      string            `json:"title"`
	DeletedAt  string            `json:"deletedAt"`
	Payload    WorkspaceEnvelope `json:"payload"`
}

type LibraryBackup struct {
	Format                    string                         `json:"format"`
	Version                   int                            `json:"version"`
	GeneratedAt               string                         `json:"generatedAt"`
	Categories                []workspacepkg.CategorySummary `json:"categories"`
	Notes                     []note.Note                    `json:"notes,omitempty"`
	Workspaces                []WorkspaceEnvelope            `json:"workspaces"`
	Tasks                     []planning.Task                `json:"standaloneTasks,omitempty"`
	Captures                  []capture.Item                 `json:"captures,omitempty"`
	Trash                     []TrashRecord                  `json:"trash"`
	Activity                  []activity.Session             `json:"studySessions"`
	DeletedActivitySessionIDs []string                       `json:"deletedActivitySessionIds,omitempty"`
}

func ValidateWorkspaceEnvelope(envelope WorkspaceEnvelope, categoryID string) error {
	authored := envelope.Project
	authored.CategoryID = categoryID
	if len(authored.Notes) != 0 || len(authored.References) != 0 {
		return workspacepkg.ErrInvalid
	}
	if err := workspacepkg.ValidateWorkspace(authored); err != nil {
		return err
	}
	for _, checkpoint := range envelope.History {
		if checkpoint.WorkspaceID != authored.ID {
			return workspacepkg.ErrInvalid
		}
		if err := workspacepkg.ValidateHistorySnapshot(checkpoint); err != nil {
			return err
		}
		if len(checkpoint.Notes) != 0 || len(checkpoint.References) != 0 {
			return workspacepkg.ErrInvalid
		}
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
	plan := envelope.Plan
	if plan.WorkspaceID == "" {
		plan.WorkspaceID = authored.ID
	}
	if err := planning.ValidatePlan(plan, authored.ID); err != nil {
		return workspacepkg.ErrInvalid
	}
	return nil
}
