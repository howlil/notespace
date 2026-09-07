package persistence

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/internal/study"
)

const libraryArchiveVersion = 2
const libraryArchiveSchemaVersion = 11
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
	Project project.Project           `json:"project"`
	History []project.HistorySnapshot `json:"history"`
	Assets  []archiveAsset            `json:"assets"`
}

type archiveTrashRecord struct {
	ID         string                   `json:"id"`
	CategoryID string                   `json:"categoryId"`
	Title      string                   `json:"title"`
	DeletedAt  string                   `json:"deletedAt"`
	Payload    archiveWorkspaceEnvelope `json:"payload"`
}

type libraryArchiveManifest struct {
	Format        string                    `json:"format"`
	Version       int                       `json:"version"`
	SchemaVersion int                       `json:"schemaVersion"`
	GeneratedAt   string                    `json:"generatedAt"`
	Categories    []project.CategorySummary `json:"categories"`
	Workspaces    []archiveWorkspaceEnvelope `json:"workspaces"`
	Trash         []archiveTrashRecord      `json:"trash"`
	Study         []study.Session           `json:"studySessions"`
	Blobs         []archiveBlob             `json:"blobs"`
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
	return archiveWorkspaceEnvelope{Project: value.Project, History: value.History, Assets: assets}
}

func (s *Store) ExportBackupArchiveAtomic(ctx context.Context) ([]byte, error) {
	backup, err := s.libraryBackupAtomic(ctx)
	if err != nil {
		return nil, err
	}
	blobs := map[string][]byte{}
	catalog := map[string]archiveBlob{}
	manifest := libraryArchiveManifest{
		Format: libraryBackupFormat, Version: libraryArchiveVersion, SchemaVersion: libraryArchiveSchemaVersion,
		GeneratedAt: backup.GeneratedAt, Categories: backup.Categories, Study: backup.Study,
		Workspaces: make([]archiveWorkspaceEnvelope, 0, len(backup.Workspaces)),
		Trash:      make([]archiveTrashRecord, 0, len(backup.Trash)),
	}
	for _, workspace := range backup.Workspaces {
		manifest.Workspaces = append(manifest.Workspaces, archiveEnvelope(workspace, blobs, catalog))
	}
	for _, record := range backup.Trash {
		manifest.Trash = append(manifest.Trash, archiveTrashRecord{
			ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt,
			Payload: archiveEnvelope(record.Payload, blobs, catalog),
		})
	}
	for _, entry := range catalog {
		manifest.Blobs = append(manifest.Blobs, entry)
	}
	sort.Slice(manifest.Blobs, func(i, j int) bool { return manifest.Blobs[i].Path < manifest.Blobs[j].Path })

	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	manifestWriter, err := writer.Create(archiveManifestPath)
	if err != nil {
		return nil, err
	}
	if _, err := manifestWriter.Write(manifestJSON); err != nil {
		return nil, err
	}
	for _, entry := range manifest.Blobs {
		header := &zip.FileHeader{Name: entry.Path, Method: zip.Store}
		blobWriter, err := writer.CreateHeader(header)
		if err != nil {
			return nil, err
		}
		if _, err := blobWriter.Write(blobs[entry.Path]); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func invalidArchive(message string) error {
	return fmt.Errorf("%s: %w", message, project.ErrInvalid)
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

func restoreArchiveAssets(refs []archiveAsset, workspaceID string, blobData map[string][]byte) ([]asset.Stored, error) {
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

func restoreArchiveEnvelope(value archiveWorkspaceEnvelope, blobData map[string][]byte) (workspaceEnvelope, error) {
	assets, err := restoreArchiveAssets(value.Assets, value.Project.ID, blobData)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	return workspaceEnvelope{Project: value.Project, History: value.History, Assets: assets}, nil
}

func (s *Store) RestoreBackupArchive(ctx context.Context, data []byte) error {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return invalidArchive("invalid ZIP backup")
	}
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		if file.Name == "" || strings.Contains(file.Name, "\\") || strings.HasPrefix(file.Name, "/") || strings.Contains(file.Name, "../") {
			return invalidArchive("unsafe backup entry")
		}
		if _, exists := entries[file.Name]; exists {
			return invalidArchive("duplicate backup entry")
		}
		entries[file.Name] = file
	}
	manifestFile := entries[archiveManifestPath]
	if manifestFile == nil {
		return invalidArchive("backup manifest missing")
	}
	manifestJSON, err := readArchiveEntry(manifestFile, maxArchiveManifestBytes)
	if err != nil {
		return err
	}
	var manifest libraryArchiveManifest
	if err := json.Unmarshal(manifestJSON, &manifest); err != nil {
		return invalidArchive("invalid backup manifest")
	}
	if manifest.Format != libraryBackupFormat || manifest.Version != libraryArchiveVersion || manifest.SchemaVersion > libraryArchiveSchemaVersion {
		return invalidArchive("unsupported backup format")
	}

	blobData := map[string][]byte{}
	seenBlobs := map[string]bool{}
	var expanded uint64
	for _, blob := range manifest.Blobs {
		if blob.Path != "blobs/"+blob.SHA256 || len(blob.SHA256) != 64 || blob.Size < 0 || seenBlobs[blob.Path] {
			return invalidArchive("invalid blob manifest")
		}
		file := entries[blob.Path]
		if file == nil || file.Method != zip.Store || file.UncompressedSize64 != uint64(blob.Size) {
			return invalidArchive("blob entry mismatch")
		}
		expanded += file.UncompressedSize64
		if expanded > uint64(len(data)) {
			// Exported blobs use zip.Store, so a valid Notespace archive cannot
			// expand beyond its archive size. This rejects decompression bombs.
			return invalidArchive("backup expands beyond round-trip bound")
		}
		body, err := readArchiveEntry(file, file.UncompressedSize64)
		if err != nil {
			return err
		}
		if archiveHash(body) != blob.SHA256 {
			return invalidArchive("blob checksum mismatch")
		}
		seenBlobs[blob.Path] = true
		blobData[blob.Path] = body
	}

	backup := libraryBackup{
		Format: libraryBackupFormat, Version: libraryBackupVersion, GeneratedAt: manifest.GeneratedAt,
		Categories: manifest.Categories, Study: manifest.Study,
		Workspaces: make([]workspaceEnvelope, 0, len(manifest.Workspaces)),
		Trash:      make([]trashRecord, 0, len(manifest.Trash)),
	}
	for _, workspace := range manifest.Workspaces {
		envelope, err := restoreArchiveEnvelope(workspace, blobData)
		if err != nil {
			return err
		}
		backup.Workspaces = append(backup.Workspaces, envelope)
	}
	for _, record := range manifest.Trash {
		envelope, err := restoreArchiveEnvelope(record.Payload, blobData)
		if err != nil {
			return err
		}
		backup.Trash = append(backup.Trash, trashRecord{ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt, Payload: envelope})
	}
	encoded, err := json.Marshal(backup)
	if err != nil {
		return err
	}
	return s.RestoreBackupJSON(ctx, encoded)
}
