package domain

import "github.com/howlil/notespace/apps/server/internal/domain/apperr"

const (
	LibraryBackupFormat  = "notespace-backup"
	LibraryBackupVersion = 6
)

type WorkspaceEnvelope struct {
	Project       Workspace      `json:"project"`
	Assets        []StoredAsset  `json:"assets"`
	NoteInstances []NoteInstance `json:"noteInstances,omitempty"`
}

type TrashRecord struct {
	ID        string            `json:"id"`
	ParentID  *string           `json:"parentId"`
	Title     string            `json:"title"`
	DeletedAt string            `json:"deletedAt"`
	Payload   WorkspaceEnvelope `json:"payload"`
}

type LibraryBackup struct {
	Format      string              `json:"format"`
	Version     int                 `json:"version"`
	GeneratedAt string              `json:"generatedAt"`
	Notes       []Note              `json:"notes,omitempty"`
	Tags        []Tag               `json:"tags,omitempty"`
	NoteTags    []NoteTag           `json:"noteTags,omitempty"`
	Workspaces  []WorkspaceEnvelope `json:"workspaces"`
	Trash       []TrashRecord       `json:"trash"`
	Redirects   []CategoryRedirect  `json:"redirects,omitempty"`
}

func ValidateWorkspaceEnvelope(envelope WorkspaceEnvelope) error {
	if err := ValidateWorkspace(envelope.Project); err != nil {
		return apperr.Wrap(ErrBackupInvalid, err)
	}
	for _, stored := range envelope.Assets {
		if stored.ID == "" || stored.WorkspaceID != envelope.Project.ID || stored.MimeType == "" || len(stored.Data) == 0 {
			return ErrBackupInvalid
		}
		if _, err := NormalizeStoredAsset(stored); err != nil {
			return ErrBackupInvalid
		}
	}
	seenInstances := map[string]bool{}
	seenElements := map[string]bool{}
	for _, instance := range envelope.NoteInstances {
		if seenInstances[instance.ID] || seenElements[instance.ElementID] || instance.WorkspaceID != envelope.Project.ID || ValidateNoteInstance(instance, envelope.Project.ID) != nil {
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
	noteIDs := map[string]bool{}
	for _, n := range value.Notes {
		if noteIDs[n.ID] || ValidateNote(n) != nil {
			return ErrBackupInvalid
		}
		noteIDs[n.ID] = true
	}
	tagIDs := map[string]bool{}
	tagKeys := map[string]bool{}
	for _, tag := range value.Tags {
		if tagIDs[tag.ID] || tagKeys[tag.NormalizedKey] || ValidateTag(tag) != nil {
			return ErrBackupInvalid
		}
		tagIDs[tag.ID] = true
		tagKeys[tag.NormalizedKey] = true
	}
	seenNoteTags := map[string]bool{}
	for _, nt := range value.NoteTags {
		key := nt.NoteID + "\x00" + nt.TagID
		if seenNoteTags[key] || !noteIDs[nt.NoteID] || !tagIDs[nt.TagID] || nt.CreatedAt == "" {
			return ErrBackupInvalid
		}
		seenNoteTags[key] = true
	}
	workspaceIDs := map[string]bool{}
	parentByID := map[string]*string{}
	for _, envelope := range value.Workspaces {
		if envelope.Project.ID == "" || workspaceIDs[envelope.Project.ID] {
			return ErrBackupInvalid
		}
		workspaceIDs[envelope.Project.ID] = true
		parentByID[envelope.Project.ID] = envelope.Project.ParentID
		if err := ValidateWorkspaceEnvelope(envelope); err != nil {
			return err
		}
		for _, instance := range envelope.NoteInstances {
			if !noteIDs[instance.NoteID] {
				return ErrBackupInvalid
			}
		}
	}
	for id, parentID := range parentByID {
		if parentID == nil {
			continue
		}
		if !workspaceIDs[*parentID] {
			return ErrBackupInvalid
		}
		// Reject cycles in the parent graph.
		seen := map[string]bool{id: true}
		cur := parentID
		for cur != nil {
			if seen[*cur] {
				return ErrBackupInvalid
			}
			seen[*cur] = true
			cur = parentByID[*cur]
		}
	}
	seenRedirects := map[string]bool{}
	for _, redirect := range value.Redirects {
		if redirect.LegacyCategoryID == "" || redirect.WorkspaceID == "" || seenRedirects[redirect.LegacyCategoryID] || !workspaceIDs[redirect.WorkspaceID] {
			return ErrBackupInvalid
		}
		seenRedirects[redirect.LegacyCategoryID] = true
	}
	trashIDs := map[string]bool{}
	for _, record := range value.Trash {
		if record.ID == "" || trashIDs[record.ID] || record.Payload.Project.ID != record.ID || workspaceIDs[record.ID] {
			return ErrBackupInvalid
		}
		trashIDs[record.ID] = true
		if err := ValidateWorkspaceEnvelope(record.Payload); err != nil {
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
