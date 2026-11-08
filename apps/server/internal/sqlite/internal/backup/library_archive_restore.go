package backupquery

import (
	"archive/zip"
	"fmt"
	"io"

	"github.com/howlil/notespace/apps/server/internal/asset"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func InvalidArchive(message string) error {
	return fmt.Errorf("%s: %w", message, workspacepkg.ErrInvalid)
}

func ReadArchiveEntry(file *zip.File, limit uint64) ([]byte, error) {
	if file.UncompressedSize64 > limit {
		return nil, InvalidArchive("backup entry exceeds size limit")
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
		return nil, InvalidArchive("backup entry exceeds size limit")
	}
	return data, nil
}

func RestoreArchiveAssets(refs []ArchiveAsset, workspaceID string, blobData map[string][]byte) ([]asset.Stored, error) {
	assets := make([]asset.Stored, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		if ref.ID == "" || ref.MimeType == "" || seen[ref.ID] || ref.Size < 0 || ref.Blob != "blobs/"+ref.SHA256 || len(ref.SHA256) != 64 {
			return nil, InvalidArchive("invalid asset manifest")
		}
		data, ok := blobData[ref.Blob]
		if !ok || int64(len(data)) != ref.Size || ArchiveHash(data) != ref.SHA256 {
			return nil, InvalidArchive("asset checksum mismatch")
		}
		seen[ref.ID] = true
		assets = append(assets, asset.Stored{ID: ref.ID, WorkspaceID: workspaceID, MimeType: ref.MimeType, Data: data, CreatedAt: ref.CreatedAt})
	}
	return assets, nil
}

func RestoreArchiveEnvelope(value ArchiveWorkspaceEnvelope, blobData map[string][]byte) (WorkspaceEnvelope, error) {
	assets, err := RestoreArchiveAssets(value.Assets, value.Project.ID, blobData)
	if err != nil {
		return WorkspaceEnvelope{}, err
	}
	return WorkspaceEnvelope{Project: value.Project, Plan: value.Plan, History: value.History, Assets: assets}, nil
}
