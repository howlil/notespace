package backupquery

import (
	"crypto/sha256"
	"encoding/hex"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const LibraryArchiveVersion = 3
const LibraryArchiveSchemaVersion = 16
const ArchiveManifestPath = "manifest.json"
const MaxArchiveManifestBytes = 16 << 20

type ArchiveBlob struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type ArchiveAsset struct {
	ID        string `json:"id"`
	MimeType  string `json:"mimeType"`
	CreatedAt string `json:"createdAt"`
	Blob      string `json:"blob"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
}

type ArchiveWorkspaceEnvelope struct {
	Project       workspacepkg.Workspace         `json:"project"`
	Plan          planning.Plan                  `json:"plan,omitempty"`
	History       []workspacepkg.HistorySnapshot `json:"history"`
	Assets        []ArchiveAsset                 `json:"assets"`
	NoteInstances []note.Instance                `json:"noteInstances,omitempty"`
}

type ArchiveTrashRecord struct {
	ID         string                   `json:"id"`
	CategoryID string                   `json:"categoryId"`
	Title      string                   `json:"title"`
	DeletedAt  string                   `json:"deletedAt"`
	Payload    ArchiveWorkspaceEnvelope `json:"payload"`
}

type LibraryArchiveManifest struct {
	Format                    string                         `json:"format"`
	Version                   int                            `json:"version"`
	SchemaVersion             int                            `json:"schemaVersion"`
	GeneratedAt               string                         `json:"generatedAt"`
	Categories                []workspacepkg.CategorySummary `json:"categories"`
	Notes                     []note.Note                    `json:"notes,omitempty"`
	Workspaces                []ArchiveWorkspaceEnvelope     `json:"workspaces"`
	Tasks                     []planning.Task                `json:"standaloneTasks,omitempty"`
	Captures                  []capture.Item                 `json:"captures,omitempty"`
	Trash                     []ArchiveTrashRecord           `json:"trash"`
	Activity                  []activity.Session             `json:"studySessions"`
	DeletedActivitySessionIDs []string                       `json:"deletedActivitySessionIds,omitempty"`
	Blobs                     []ArchiveBlob                  `json:"blobs"`
}

func ArchiveHash(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func ArchiveEnvelope(value WorkspaceEnvelope, blobs map[string][]byte, catalog map[string]ArchiveBlob) ArchiveWorkspaceEnvelope {
	assets := make([]ArchiveAsset, 0, len(value.Assets))
	for _, stored := range value.Assets {
		hash := ArchiveHash(stored.Data)
		path := "blobs/" + hash
		if _, exists := blobs[path]; !exists {
			blobs[path] = stored.Data
			catalog[path] = ArchiveBlob{Path: path, SHA256: hash, Size: int64(len(stored.Data))}
		}
		assets = append(assets, ArchiveAsset{ID: stored.ID, MimeType: stored.MimeType, CreatedAt: stored.CreatedAt, Blob: path, SHA256: hash, Size: int64(len(stored.Data))})
	}
	return ArchiveWorkspaceEnvelope{Project: value.Project, Plan: value.Plan, History: value.History, Assets: assets, NoteInstances: value.NoteInstances}
}
