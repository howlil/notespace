package sqlite

import (
	"crypto/sha256"
	"encoding/hex"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const libraryArchiveVersion = 2
const libraryArchiveSchemaVersion = 14
const archiveManifestPath = "manifest.json"
const maxArchiveManifestBytes = 16 << 20

type archiveBlob struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type archiveAsset struct {
	ID        string `json:"id"`
	MimeType  string `json:"mimeType"`
	CreatedAt string `json:"createdAt"`
	Blob      string `json:"blob"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
}

type archiveWorkspaceEnvelope struct {
	Project workspacepkg.Workspace         `json:"project"`
	Plan    planning.Plan                  `json:"plan,omitempty"`
	History []workspacepkg.HistorySnapshot `json:"history"`
	Assets  []archiveAsset                 `json:"assets"`
}

type archiveTrashRecord struct {
	ID         string                   `json:"id"`
	CategoryID string                   `json:"categoryId"`
	Title      string                   `json:"title"`
	DeletedAt  string                   `json:"deletedAt"`
	Payload    archiveWorkspaceEnvelope `json:"payload"`
}

type libraryArchiveManifest struct {
	Format        string                         `json:"format"`
	Version       int                            `json:"version"`
	SchemaVersion int                            `json:"schemaVersion"`
	GeneratedAt   string                         `json:"generatedAt"`
	Categories    []workspacepkg.CategorySummary `json:"categories"`
	Workspaces    []archiveWorkspaceEnvelope     `json:"workspaces"`
	Tasks         []planning.Task                `json:"standaloneTasks,omitempty"`
	Trash         []archiveTrashRecord           `json:"trash"`
	Activity      []activity.Session             `json:"studySessions"`
	Blobs         []archiveBlob                  `json:"blobs"`
}

func archiveHash(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func archiveEnvelope(value workspaceEnvelope, blobs map[string][]byte, catalog map[string]archiveBlob) archiveWorkspaceEnvelope {
	assets := make([]archiveAsset, 0, len(value.Assets))
	for _, stored := range value.Assets {
		hash := archiveHash(stored.Data)
		path := "blobs/" + hash
		if _, exists := blobs[path]; !exists {
			blobs[path] = stored.Data
			catalog[path] = archiveBlob{Path: path, SHA256: hash, Size: int64(len(stored.Data))}
		}
		assets = append(assets, archiveAsset{ID: stored.ID, MimeType: stored.MimeType, CreatedAt: stored.CreatedAt, Blob: path, SHA256: hash, Size: int64(len(stored.Data))})
	}
	return archiveWorkspaceEnvelope{Project: value.Project, Plan: value.Plan, History: value.History, Assets: assets}
}
