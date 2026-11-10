package backupquery

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"sort"
	"strings"
)

// EncodeArchive consumes a consistent snapshot; it never reads or mutates SQL.
func EncodeArchive(backup LibraryBackup) ([]byte, error) {
	blobs := map[string][]byte{}
	manifest := archiveManifest(backup, blobs)
	return writeArchive(manifest, blobs)
}

func archiveManifest(backup LibraryBackup, blobs map[string][]byte) LibraryArchiveManifest {
	catalog := map[string]ArchiveBlob{}
	manifest := LibraryArchiveManifest{
		Format: LibraryBackupFormat, Version: LibraryArchiveVersion, SchemaVersion: LibraryArchiveSchemaVersion,
		GeneratedAt: backup.GeneratedAt, Categories: backup.Categories, Activity: backup.Activity, DeletedActivitySessionIDs: backup.DeletedActivitySessionIDs, Tasks: backup.Tasks, Captures: backup.Captures,
		Workspaces: make([]ArchiveWorkspaceEnvelope, 0, len(backup.Workspaces)),
		Trash:      make([]ArchiveTrashRecord, 0, len(backup.Trash)),
	}
	for _, workspace := range backup.Workspaces {
		manifest.Workspaces = append(manifest.Workspaces, ArchiveEnvelope(workspace, blobs, catalog))
	}
	for _, record := range backup.Trash {
		manifest.Trash = append(manifest.Trash, ArchiveTrashRecord{
			ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt,
			Payload: ArchiveEnvelope(record.Payload, blobs, catalog),
		})
	}
	for _, entry := range catalog {
		manifest.Blobs = append(manifest.Blobs, entry)
	}
	sort.Slice(manifest.Blobs, func(i, j int) bool { return manifest.Blobs[i].Path < manifest.Blobs[j].Path })

	return manifest
}

func writeArchive(manifest LibraryArchiveManifest, blobs map[string][]byte) ([]byte, error) {
	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	manifestWriter, err := writer.Create(ArchiveManifestPath)
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

// DecodeArchive validates all ZIP input before Store may begin atomic restore.
func DecodeArchive(data []byte) (LibraryBackup, error) {
	entries, err := archiveEntries(data)
	if err != nil {
		return LibraryBackup{}, err
	}
	manifest, err := readArchiveManifest(entries)
	if err != nil {
		return LibraryBackup{}, err
	}
	blobs, err := readArchiveBlobs(manifest, entries, len(data))
	if err != nil {
		return LibraryBackup{}, err
	}
	return archiveBackup(manifest, blobs)
}

func archiveEntries(data []byte) (map[string]*zip.File, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, InvalidArchive("invalid ZIP backup")
	}
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		if file.Name == "" || strings.Contains(file.Name, "\\") || strings.HasPrefix(file.Name, "/") || strings.Contains(file.Name, "../") {
			return nil, InvalidArchive("unsafe backup entry")
		}
		if _, exists := entries[file.Name]; exists {
			return nil, InvalidArchive("duplicate backup entry")
		}
		entries[file.Name] = file
	}

	return entries, nil
}

func readArchiveManifest(entries map[string]*zip.File) (LibraryArchiveManifest, error) {
	manifestFile := entries[ArchiveManifestPath]
	if manifestFile == nil {
		return LibraryArchiveManifest{}, InvalidArchive("backup manifest missing")
	}
	manifestJSON, err := ReadArchiveEntry(manifestFile, MaxArchiveManifestBytes)
	if err != nil {
		return LibraryArchiveManifest{}, err
	}
	var manifest LibraryArchiveManifest
	if err := json.Unmarshal(manifestJSON, &manifest); err != nil {
		return LibraryArchiveManifest{}, InvalidArchive("invalid backup manifest")
	}
	if manifest.Format != LibraryBackupFormat || (manifest.Version != 2 && manifest.Version != LibraryArchiveVersion) || manifest.SchemaVersion > LibraryArchiveSchemaVersion {
		return LibraryArchiveManifest{}, InvalidArchive("unsupported backup format")
	}

	return manifest, nil
}

func validateArchiveBlobEntry(file *zip.File, blob ArchiveBlob) error {
	if file == nil || file.Method != zip.Store || file.UncompressedSize64 != uint64(blob.Size) {
		return InvalidArchive("blob entry mismatch")
	}
	return nil
}

func readArchiveBlobs(manifest LibraryArchiveManifest, entries map[string]*zip.File, archiveSize int) (map[string][]byte, error) {
	blobData := map[string][]byte{}
	seenBlobs := map[string]bool{}
	var expanded uint64
	for _, blob := range manifest.Blobs {
		if blob.Path != "blobs/"+blob.SHA256 || len(blob.SHA256) != 64 || blob.Size < 0 || seenBlobs[blob.Path] {
			return nil, InvalidArchive("invalid blob manifest")
		}
		file := entries[blob.Path]
		if err := validateArchiveBlobEntry(file, blob); err != nil {
			return nil, err
		}
		expanded += file.UncompressedSize64
		if expanded > uint64(archiveSize) {

			// Exported blobs use zip.Store, so a valid Notespace archive cannot
			// expand beyond its archive size. This rejects decompression bombs.
			return nil, InvalidArchive("backup expands beyond round-trip bound")
		}
		body, err := ReadArchiveEntry(file, file.UncompressedSize64)
		if err != nil {
			return nil, err
		}
		if ArchiveHash(body) != blob.SHA256 {
			return nil, InvalidArchive("blob checksum mismatch")
		}
		seenBlobs[blob.Path] = true
		blobData[blob.Path] = body
	}

	return blobData, nil
}

func archiveBackup(manifest LibraryArchiveManifest, blobData map[string][]byte) (LibraryBackup, error) {
	backup := LibraryBackup{
		Format: LibraryBackupFormat, Version: manifest.Version, GeneratedAt: manifest.GeneratedAt,
		Categories: manifest.Categories, Activity: manifest.Activity, DeletedActivitySessionIDs: manifest.DeletedActivitySessionIDs, Tasks: manifest.Tasks, Captures: manifest.Captures,
		Workspaces: make([]WorkspaceEnvelope, 0, len(manifest.Workspaces)),
		Trash:      make([]TrashRecord, 0, len(manifest.Trash)),
	}
	for _, workspace := range manifest.Workspaces {
		envelope, err := RestoreArchiveEnvelope(workspace, blobData)
		if err != nil {
			return LibraryBackup{}, err
		}
		backup.Workspaces = append(backup.Workspaces, envelope)
	}
	for _, record := range manifest.Trash {
		envelope, err := RestoreArchiveEnvelope(record.Payload, blobData)
		if err != nil {
			return LibraryBackup{}, err
		}
		backup.Trash = append(backup.Trash, TrashRecord{ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt, Payload: envelope})
	}

	return backup, nil
}
