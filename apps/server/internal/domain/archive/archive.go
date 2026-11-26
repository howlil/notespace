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
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

const (
	Version          = 6
	SchemaVersion    = 18
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
	ID        string            `json:"id"`
	ParentID  *string           `json:"parentId"`
	Title     string            `json:"title"`
	DeletedAt string            `json:"deletedAt"`
	Payload   WorkspaceEnvelope `json:"payload"`
}

type Manifest struct {
	Format        string                    `json:"format"`
	Version       int                       `json:"version"`
	SchemaVersion int                       `json:"schemaVersion"`
	GeneratedAt   string                    `json:"generatedAt"`
	Notes         []domain.Note             `json:"notes,omitempty"`
	Tags          []domain.Tag              `json:"tags,omitempty"`
	NoteTags      []domain.NoteTag          `json:"noteTags,omitempty"`
	Workspaces    []WorkspaceEnvelope       `json:"workspaces"`
	Trash         []TrashRecord             `json:"trash"`
	Redirects     []domain.CategoryRedirect `json:"redirects,omitempty"`
	Blobs         []Blob                    `json:"blobs"`
}

type legacyCategory struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type legacyWorkspace struct {
	domain.Workspace
	CategoryID string `json:"categoryId"`
}

type legacyWorkspaceEnvelope struct {
	Project       legacyWorkspace       `json:"project"`
	Assets        []Asset               `json:"assets"`
	NoteInstances []domain.NoteInstance `json:"noteInstances,omitempty"`
}

type legacyTrashRecord struct {
	ID         string                  `json:"id"`
	CategoryID string                  `json:"categoryId"`
	Title      string                  `json:"title"`
	DeletedAt  string                  `json:"deletedAt"`
	Payload    legacyWorkspaceEnvelope `json:"payload"`
}

type legacyManifest struct {
	Format        string                    `json:"format"`
	Version       int                       `json:"version"`
	SchemaVersion int                       `json:"schemaVersion"`
	GeneratedAt   string                    `json:"generatedAt"`
	Categories    []legacyCategory          `json:"categories"`
	Notes         []domain.Note             `json:"notes,omitempty"`
	Workspaces    []legacyWorkspaceEnvelope `json:"workspaces"`
	Trash         []legacyTrashRecord       `json:"trash"`
	Blobs         []Blob                    `json:"blobs"`
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
	manifest, rawJSON, err := readArchiveManifest(entries)
	if err != nil {
		return domain.LibraryBackup{}, err
	}
	blobs, err := readArchiveBlobs(manifest, entries, len(data))
	if err != nil {
		return domain.LibraryBackup{}, err
	}
	if manifest.Version < 5 {
		return buildBackupFromLegacyArchive(rawJSON, blobDataOrEmpty(blobs))
	}
	return buildBackupFromArchive(manifest, blobs)
}

func blobDataOrEmpty(blobs map[string][]byte) map[string][]byte {
	if blobs == nil {
		return map[string][]byte{}
	}
	return blobs
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
		Notes:         backup.Notes,
		Tags:          backup.Tags,
		NoteTags:      backup.NoteTags,
		Workspaces:    make([]WorkspaceEnvelope, 0, len(backup.Workspaces)),
		Trash:         make([]TrashRecord, 0, len(backup.Trash)),
		Redirects:     backup.Redirects,
	}
	for _, ws := range backup.Workspaces {
		manifest.Workspaces = append(manifest.Workspaces, archiveEnvelope(ws, blobs, catalog))
	}
	for _, record := range backup.Trash {
		manifest.Trash = append(manifest.Trash, TrashRecord{
			ID: record.ID, ParentID: record.ParentID, Title: record.Title, DeletedAt: record.DeletedAt,
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

func readArchiveManifest(entries map[string]*zip.File) (Manifest, []byte, error) {
	manifestFile := entries[ManifestPath]
	if manifestFile == nil {
		return Manifest{}, nil, invalidArchive("backup manifest missing")
	}
	manifestJSON, err := readArchiveEntry(manifestFile, MaxManifestBytes)
	if err != nil {
		return Manifest{}, nil, err
	}
	var manifest Manifest
	if err := json.Unmarshal(manifestJSON, &manifest); err != nil {
		return Manifest{}, nil, invalidArchive("invalid backup manifest")
	}
	if manifest.Format != domain.LibraryBackupFormat || (manifest.Version < 2 || manifest.Version > Version) || manifest.SchemaVersion > SchemaVersion {
		return Manifest{}, nil, invalidArchive("unsupported backup format")
	}
	return manifest, manifestJSON, nil
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
		Notes:       manifest.Notes,
		Tags:        manifest.Tags,
		NoteTags:    manifest.NoteTags,
		Workspaces:  make([]domain.WorkspaceEnvelope, 0, len(manifest.Workspaces)),
		Trash:       make([]domain.TrashRecord, 0, len(manifest.Trash)),
		Redirects:   manifest.Redirects,
	}
	for _, ws := range manifest.Workspaces {
		envelope, err := restoreArchiveEnvelope(ws, blobData)
		if err != nil {
			return domain.LibraryBackup{}, err
		}
		result.Workspaces = append(result.Workspaces, envelope)
	}
	for _, record := range manifest.Trash {
		envelope, err := restoreArchiveEnvelope(record.Payload, blobData)
		if err != nil {
			return domain.LibraryBackup{}, err
		}
		result.Trash = append(result.Trash, domain.TrashRecord{
			ID: record.ID, ParentID: record.ParentID, Title: record.Title, DeletedAt: record.DeletedAt, Payload: envelope,
		})
	}
	return result, nil
}

func buildBackupFromLegacyArchive(rawJSON []byte, blobData map[string][]byte) (domain.LibraryBackup, error) {
	var manifest legacyManifest
	if err := json.Unmarshal(rawJSON, &manifest); err != nil {
		return domain.LibraryBackup{}, invalidArchive("invalid legacy backup manifest")
	}
	if len(manifest.Categories) == 0 {
		return domain.LibraryBackup{}, invalidArchive("legacy backup missing categories")
	}
	categoryIDs := map[string]bool{}
	for _, cat := range manifest.Categories {
		if cat.ID == "" || cat.Title == "" || categoryIDs[cat.ID] {
			return domain.LibraryBackup{}, invalidArchive("invalid legacy category")
		}
		categoryIDs[cat.ID] = true
	}
	if !categoryIDs[domain.UncategorizedCategoryID] {
		return domain.LibraryBackup{}, invalidArchive("legacy backup missing default category")
	}

	occupied := map[string]bool{}
	for _, ws := range manifest.Workspaces {
		occupied[ws.Project.ID] = true
	}
	for _, tr := range manifest.Trash {
		occupied[tr.ID] = true
	}

	redirects := make([]domain.CategoryRedirect, 0, len(manifest.Categories))
	redirectMap := map[string]string{}
	convertedRoots := make([]domain.WorkspaceEnvelope, 0, len(manifest.Categories))
	emptyCanvas := domain.CanvasSnapshot{
		Format:  "excalidraw",
		Version: 1,
		Data:    json.RawMessage(`{"elements":[],"appState":{},"files":{}}`),
	}

	for idx, cat := range manifest.Categories {
		if cat.ID == domain.UncategorizedCategoryID {
			continue
		}
		targetID := cat.ID
		if occupied[targetID] {
			prefix := cat.ID
			if len(prefix) > 80 {
				prefix = prefix[:80]
			}
			for n := 0; ; n++ {
				suffix := ""
				if n > 0 {
					suffix = fmt.Sprintf("-%d", n)
				}
				candidate := fmt.Sprintf("cat-%d%s-%s", idx+1, suffix, prefix)
				if !occupied[candidate] && !categoryIDs[candidate] {
					targetID = candidate
					break
				}
			}
		}
		occupied[targetID] = true
		redirectMap[cat.ID] = targetID
		redirects = append(redirects, domain.CategoryRedirect{
			LegacyCategoryID: cat.ID,
			WorkspaceID:      targetID,
		})
		convertedRoots = append(convertedRoots, domain.WorkspaceEnvelope{
			Project: domain.Workspace{
				WorkspaceSummary: domain.WorkspaceSummary{
					ID:        targetID,
					ParentID:  nil,
					Title:     cat.Title,
					CreatedAt: cat.CreatedAt,
					UpdatedAt: cat.UpdatedAt,
					Version:   1,
				},
				Canvas:        emptyCanvas,
				CanvasVersion: 1,
			},
			Assets: []domain.StoredAsset{},
		})
	}

	result := domain.LibraryBackup{
		Format:      domain.LibraryBackupFormat,
		Version:     Version,
		GeneratedAt: manifest.GeneratedAt,
		Notes:       manifest.Notes,
		Workspaces:  make([]domain.WorkspaceEnvelope, 0, len(convertedRoots)+len(manifest.Workspaces)),
		Trash:       make([]domain.TrashRecord, 0, len(manifest.Trash)),
		Redirects:   redirects,
	}
	result.Workspaces = append(result.Workspaces, convertedRoots...)

	resolveLegacyParent := func(catID string) (*string, bool) {
		if catID == domain.UncategorizedCategoryID {
			return nil, true
		}
		mapped, ok := redirectMap[catID]
		if !ok {
			return nil, false
		}
		return &mapped, true
	}

	for _, ws := range manifest.Workspaces {
		if !categoryIDs[ws.Project.CategoryID] {
			return domain.LibraryBackup{}, invalidArchive("workspace references unknown legacy category")
		}
		parentID, _ := resolveLegacyParent(ws.Project.CategoryID)
		project := ws.Project.Workspace
		project.ParentID = parentID
		if manifest.Version == 2 {
			var err error
			project.Canvas, _, _, err = domain.ScrubRetiredSnapshot(project.Canvas)
			if err != nil {
				return domain.LibraryBackup{}, invalidArchive("invalid canvas snapshot")
			}
		}
		assets, err := restoreArchiveAssets(ws.Assets, project.ID, blobData)
		if err != nil {
			return domain.LibraryBackup{}, err
		}
		result.Workspaces = append(result.Workspaces, domain.WorkspaceEnvelope{
			Project:       project,
			Assets:        assets,
			NoteInstances: ws.NoteInstances,
		})
	}

	for _, record := range manifest.Trash {
		parentID, _ := resolveLegacyParent(record.CategoryID)
		project := record.Payload.Project.Workspace
		project.ParentID = parentID
		if manifest.Version == 2 {
			var err error
			project.Canvas, _, _, err = domain.ScrubRetiredSnapshot(project.Canvas)
			if err != nil {
				return domain.LibraryBackup{}, invalidArchive("invalid canvas snapshot")
			}
		}
		assets, err := restoreArchiveAssets(record.Payload.Assets, project.ID, blobData)
		if err != nil {
			return domain.LibraryBackup{}, err
		}
		result.Trash = append(result.Trash, domain.TrashRecord{
			ID:        record.ID,
			ParentID:  parentID,
			Title:     record.Title,
			DeletedAt: record.DeletedAt,
			Payload: domain.WorkspaceEnvelope{
				Project:       project,
				Assets:        assets,
				NoteInstances: record.Payload.NoteInstances,
			},
		})
	}

	return result, nil
}
