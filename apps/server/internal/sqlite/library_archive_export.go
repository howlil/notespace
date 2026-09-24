package sqlite

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"sort"
)

func (s *Store) ExportBackupArchive(ctx context.Context) ([]byte, error) {
	backup, err := s.libraryBackupAtomic(ctx)
	if err != nil {
		return nil, err
	}
	blobs := map[string][]byte{}
	catalog := map[string]archiveBlob{}
	manifest := libraryArchiveManifest{
		Format: libraryBackupFormat, Version: libraryArchiveVersion, SchemaVersion: libraryArchiveSchemaVersion,
		GeneratedAt: backup.GeneratedAt, Categories: backup.Categories, Activity: backup.Activity, Tasks: backup.Tasks,
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
