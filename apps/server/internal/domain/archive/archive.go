// Package archive provides pure, SQL-free codecs for portable Notespace ZIP
// backups and compressed Trash workspace envelopes.
package archive

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"sort"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

const (
	Version          = 4
	SchemaVersion    = 16
	ManifestPath     = "manifest.json"
	MaxManifestBytes = 16 << 20
)

type Blob struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type Asset struct {
	ID        string `json:"id"`
	MimeType  string `json:"mimeType"`
	CreatedAt string `json:"createdAt"`
	Blob      string `json:"blob"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
}

type WorkspaceEnvelope struct {
	Project       domain.Workspace      `json:"project"`
	Assets        []Asset               `json:"assets"`
	NoteInstances []domain.NoteInstance `json:"noteInstances,omitempty"`
}

type TrashRecord struct {
	ID         string            `json:"id"`
	CategoryID string            `json:"categoryId"`
	Title      string            `json:"title"`
	DeletedAt  string            `json:"deletedAt"`
	Payload    WorkspaceEnvelope `json:"payload"`
}

type Manifest struct {
	Format        string                   `json:"format"`
	Version       int                      `json:"version"`
	SchemaVersion int                      `json:"schemaVersion"`
	GeneratedAt   string                   `json:"generatedAt"`
	Categories    []domain.CategorySummary `json:"categories"`
	Notes         []domain.Note            `json:"notes,omitempty"`
	Workspaces    []WorkspaceEnvelope      `json:"workspaces"`
	Trash         []TrashRecord            `json:"trash"`
	Blobs         []Blob                   `json:"blobs"`
}

func Encode(backup domain.LibraryBackup) ([]byte, error) {
	blobs := map[string][]byte{}
	manifest := buildManifest(backup, blobs)
	return writeArchive(manifest, blobs)
}

func Decode(data []byte) (domain.LibraryBackup, error) {
	entries, err := archiveEntries(data)
	if err != nil {
		return domain.LibraryBackup{}, err
	}
	manifest, err := readArchiveManifest(entries)
	if err != nil {
		return domain.LibraryBackup{}, err
	}
	blobs, err := readArchiveBlobs(manifest, entries, len(data))
	if err != nil {
		return domain.LibraryBackup{}, err
	}
	return buildBackupFromArchive(manifest, blobs)
}

func archiveHash(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func invalidArchive(message string) error {
	return apperr.Wrap(domain.ErrBackupInvalid, errors.New(message))
}

func archiveEnvelope(value domain.WorkspaceEnvelope, blobs map[string][]byte, catalog map[string]Blob) WorkspaceEnvelope {
	assets := make([]Asset, 0, len(value.Assets))
	for _, stored := range value.Assets {
		hash := archiveHash(stored.Data)
		path := "blobs/" + hash
		if _, exists := blobs[path]; !exists {
			blobs[path] = stored.Data
			catalog[path] = Blob{Path: path, SHA256: hash, Size: int64(len(stored.Data))}
		}
		assets = append(assets, Asset{
			ID: stored.ID, MimeType: stored.MimeType, CreatedAt: stored.CreatedAt,
			Blob: path, SHA256: hash, Size: int64(len(stored.Data)),
		})
	}
	return WorkspaceEnvelope{Project: value.Project, Assets: assets, NoteInstances: value.NoteInstances}
}

func buildManifest(backup domain.LibraryBackup, blobs map[string][]byte) Manifest {
	catalog := map[string]Blob{}
	manifest := Manifest{
		Format:        domain.LibraryBackupFormat,
		Version:       Version,
		SchemaVersion: SchemaVersion,
		GeneratedAt:   backup.GeneratedAt,
		Categories:    backup.Categories,
		Notes:         backup.Notes,
		Workspaces:    make([]WorkspaceEnvelope, 0, len(backup.Workspaces)),
		Trash:         make([]TrashRecord, 0, len(backup.Trash)),
	}
	for _, ws := range backup.Workspaces {
		manifest.Workspaces = append(manifest.Workspaces, archiveEnvelope(ws, blobs, catalog))
	}
	for _, record := range backup.Trash {
		manifest.Trash = append(manifest.Trash, TrashRecord{
			ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt,
			Payload: archiveEnvelope(record.Payload, blobs, catalog),
		})
	}
	for _, entry := range catalog {
		manifest.Blobs = append(manifest.Blobs, entry)
	}
	sort.Slice(manifest.Blobs, func(i, j int) bool { return manifest.Blobs[i].Path < manifest.Blobs[j].Path })
	return manifest
}

func writeArchive(manifest Manifest, blobs map[string][]byte) ([]byte, error) {
	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	manifestWriter, err := writer.Create(ManifestPath)
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

func archiveEntries(data []byte) (map[string]*zip.File, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, invalidArchive("invalid ZIP backup")
	}
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		if file.Name == "" || strings.Contains(file.Name, "\\") || strings.HasPrefix(file.Name, "/") || strings.Contains(file.Name, "../") {
			return nil, invalidArchive("unsafe backup entry")
		}
		if _, exists := entries[file.Name]; exists {
			return nil, invalidArchive("duplicate backup entry")
		}
		entries[file.Name] = file
	}
	return entries, nil
}

func readArchiveEntry(file *zip.File, limit uint64) ([]byte, error) {
	if file.UncompressedSize64 > limit {
		return nil, invalidArchive("backup entry exceeds size limit")
	}
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer func() { _ = reader.Close() }()
	data, err := io.ReadAll(io.LimitReader(reader, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if uint64(len(data)) > limit {
		return nil, invalidArchive("backup entry exceeds size limit")
	}
	return data, nil
}

func readArchiveManifest(entries map[string]*zip.File) (Manifest, error) {
	manifestFile := entries[ManifestPath]
	if manifestFile == nil {
		return Manifest{}, invalidArchive("backup manifest missing")
	}
	manifestJSON, err := readArchiveEntry(manifestFile, MaxManifestBytes)
	if err != nil {
		return Manifest{}, err
	}
	var manifest Manifest
	if err := json.Unmarshal(manifestJSON, &manifest); err != nil {
		return Manifest{}, invalidArchive("invalid backup manifest")
	}
	if manifest.Format != domain.LibraryBackupFormat || (manifest.Version < 2 || manifest.Version > Version) || manifest.SchemaVersion > SchemaVersion {
		return Manifest{}, invalidArchive("unsupported backup format")
	}
	return manifest, nil
}

func readArchiveBlobs(manifest Manifest, entries map[string]*zip.File, archiveSize int) (map[string][]byte, error) {
	blobData := map[string][]byte{}
	seenBlobs := map[string]bool{}
	var expanded uint64
	for _, blob := range manifest.Blobs {
		if blob.Path != "blobs/"+blob.SHA256 || len(blob.SHA256) != 64 || blob.Size < 0 || seenBlobs[blob.Path] {
			return nil, invalidArchive("invalid blob manifest")
		}
		file := entries[blob.Path]
		if file == nil || file.Method != zip.Store || file.UncompressedSize64 != uint64(blob.Size) {
			return nil, invalidArchive("blob entry mismatch")
		}
		expanded += file.UncompressedSize64
		if expanded > uint64(archiveSize) {
			return nil, invalidArchive("backup expands beyond round-trip bound")
		}
		body, err := readArchiveEntry(file, file.UncompressedSize64)
		if err != nil {
			return nil, err
		}
		if archiveHash(body) != blob.SHA256 {
			return nil, invalidArchive("blob checksum mismatch")
		}
		seenBlobs[blob.Path] = true
		blobData[blob.Path] = body
	}
	return blobData, nil
}

func restoreArchiveAssets(refs []Asset, workspaceID string, blobData map[string][]byte) ([]domain.StoredAsset, error) {
	assets := make([]domain.StoredAsset, 0, len(refs))
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
		assets = append(assets, domain.StoredAsset{
			ID: ref.ID, WorkspaceID: workspaceID, MimeType: ref.MimeType, Data: data, CreatedAt: ref.CreatedAt,
		})
	}
	return assets, nil
}

func restoreArchiveEnvelope(value WorkspaceEnvelope, blobData map[string][]byte) (domain.WorkspaceEnvelope, error) {
	assets, err := restoreArchiveAssets(value.Assets, value.Project.ID, blobData)
	if err != nil {
		return domain.WorkspaceEnvelope{}, err
	}
	return domain.WorkspaceEnvelope{Project: value.Project, Assets: assets, NoteInstances: value.NoteInstances}, nil
}

func buildBackupFromArchive(manifest Manifest, blobData map[string][]byte) (domain.LibraryBackup, error) {
	result := domain.LibraryBackup{
		Format:      domain.LibraryBackupFormat,
		Version:     manifest.Version,
		GeneratedAt: manifest.GeneratedAt,
		Categories:  manifest.Categories,
		Notes:       manifest.Notes,
		Workspaces:  make([]domain.WorkspaceEnvelope, 0, len(manifest.Workspaces)),
		Trash:       make([]domain.TrashRecord, 0, len(manifest.Trash)),
	}
	for _, ws := range manifest.Workspaces {
		envelope, err := restoreArchiveEnvelope(ws, blobData)
		if err != nil {
			return domain.LibraryBackup{}, err
		}
		if manifest.Version == 2 {
			envelope.Project.Canvas, _, _, err = domain.ScrubRetiredSnapshot(envelope.Project.Canvas)
			if err != nil {
				return domain.LibraryBackup{}, invalidArchive("invalid canvas snapshot")
			}
		}
		result.Workspaces = append(result.Workspaces, envelope)
	}
	for _, record := range manifest.Trash {
		envelope, err := restoreArchiveEnvelope(record.Payload, blobData)
		if err != nil {
			return domain.LibraryBackup{}, err
		}
		if manifest.Version == 2 {
			envelope.Project.Canvas, _, _, err = domain.ScrubRetiredSnapshot(envelope.Project.Canvas)
			if err != nil {
				return domain.LibraryBackup{}, invalidArchive("invalid canvas snapshot")
			}
		}
		result.Trash = append(result.Trash, domain.TrashRecord{
			ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt, Payload: envelope,
		})
	}
	return result, nil
}
