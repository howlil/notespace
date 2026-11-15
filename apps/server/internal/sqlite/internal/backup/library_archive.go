package backupquery

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/note"
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
	Project       workspacepkg.Workspace `json:"project"`
	Assets        []ArchiveAsset         `json:"assets"`
	NoteInstances []note.Instance        `json:"noteInstances,omitempty"`
}

type ArchiveTrashRecord struct {
	ID         string                   `json:"id"`
	CategoryID string                   `json:"categoryId"`
	Title      string                   `json:"title"`
	DeletedAt  string                   `json:"deletedAt"`
	Payload    ArchiveWorkspaceEnvelope `json:"payload"`
}

type LibraryArchiveManifest struct {
	Format        string                         `json:"format"`
	Version       int                            `json:"version"`
	SchemaVersion int                            `json:"schemaVersion"`
	GeneratedAt   string                         `json:"generatedAt"`
	Categories    []workspacepkg.CategorySummary `json:"categories"`
	Notes         []note.Note                    `json:"notes,omitempty"`
	Workspaces    []ArchiveWorkspaceEnvelope     `json:"workspaces"`
	Trash         []ArchiveTrashRecord           `json:"trash"`
	Blobs         []ArchiveBlob                  `json:"blobs"`
}

func archiveHash(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func archiveEnvelope(value WorkspaceEnvelope, blobs map[string][]byte, catalog map[string]ArchiveBlob) ArchiveWorkspaceEnvelope {
	assets := make([]ArchiveAsset, 0, len(value.Assets))
	for _, stored := range value.Assets {
		hash := archiveHash(stored.Data)
		path := "blobs/" + hash
		if _, exists := blobs[path]; !exists {
			blobs[path] = stored.Data
			catalog[path] = ArchiveBlob{Path: path, SHA256: hash, Size: int64(len(stored.Data))}
		}
		assets = append(assets, ArchiveAsset{ID: stored.ID, MimeType: stored.MimeType, CreatedAt: stored.CreatedAt, Blob: path, SHA256: hash, Size: int64(len(stored.Data))})
	}
	return ArchiveWorkspaceEnvelope{Project: value.Project, Assets: assets, NoteInstances: value.NoteInstances}
}

func invalidArchive(message string) error {
	return fmt.Errorf("%s: %w", message, workspacepkg.ErrInvalid)
}

func readArchiveEntry(file *zip.File, limit uint64) ([]byte, error) {
	if file.UncompressedSize64 > limit {
		return nil, invalidArchive("backup entry exceeds size limit")
	}
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if uint64(len(data)) > limit {
		return nil, invalidArchive("backup entry exceeds size limit")
	}
	return data, nil
}

func restoreArchiveAssets(refs []ArchiveAsset, workspaceID string, blobData map[string][]byte) ([]asset.Stored, error) {
	assets := make([]asset.Stored, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		if ref.ID == "" || ref.MimeType == "" || seen[ref.ID] || ref.Size < 0 || ref.Blob != "blobs/"+ref.SHA256 || len(ref.SHA256) != 64 {
			return nil, invalidArchive("invalid asset manifest")
		}
		data, ok := blobData[ref.Blob]
		if !ok || int64(len(data)) != ref.Size || archiveHash(data) != ref.SHA256 {
			return nil, invalidArchive("asset checksum mismatch")
		}
		seen[ref.ID] = true
		assets = append(assets, asset.Stored{ID: ref.ID, WorkspaceID: workspaceID, MimeType: ref.MimeType, Data: data, CreatedAt: ref.CreatedAt})
	}
	return assets, nil
}

func restoreArchiveEnvelope(value ArchiveWorkspaceEnvelope, blobData map[string][]byte) (WorkspaceEnvelope, error) {
	assets, err := restoreArchiveAssets(value.Assets, value.Project.ID, blobData)
	if err != nil {
		return WorkspaceEnvelope{}, err
	}
	return WorkspaceEnvelope{Project: value.Project, Assets: assets, NoteInstances: value.NoteInstances}, nil
}
