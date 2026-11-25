package domain

import (
	"bytes"
	"mime"
	"strings"
)

type StoredAsset struct {
	ID          string
	WorkspaceID string
	MimeType    string
	Data        []byte
	CreatedAt   string
}

// NormalizeAssetMimeType accepts only raster image MIME types used by durable
// assets. SVG/XML/HTML are rejected because assets are served inline without an
// isolating CSP.
func NormalizeAssetMimeType(value string) (string, error) {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	lower := strings.ToLower(mediaType)
	if err != nil || !strings.HasPrefix(lower, "image/") || strings.HasPrefix(lower, "image/svg") ||
		strings.HasPrefix(lower, "image/xml") || strings.HasPrefix(lower, "image/html") ||
		strings.HasSuffix(lower, "+xml") || strings.HasSuffix(lower, "+html") {
		return "", ErrAssetInvalid
	}
	return mediaType, nil
}

func looksLikeMarkupDocument(data []byte) bool {
	sample := data
	if len(sample) > 512 {
		sample = sample[:512]
	}
	trimmed := bytes.ToLower(bytes.TrimSpace(sample))
	for _, prefix := range [][]byte{
		[]byte("<svg"),
		[]byte("<?xml"),
		[]byte("<!doctype"),
		[]byte("<html"),
		[]byte("<script"),
	} {
		if bytes.HasPrefix(trimmed, prefix) {
			return true
		}
	}
	return false
}

func NormalizeStoredAsset(value StoredAsset) (StoredAsset, error) {
	value.ID = strings.TrimSpace(value.ID)
	value.WorkspaceID = strings.TrimSpace(value.WorkspaceID)
	if !ValidID(value.ID, MaxAssetIDLength) || !ValidID(value.WorkspaceID, MaxAssetIDLength) || len(value.Data) == 0 || looksLikeMarkupDocument(value.Data) {
		return StoredAsset{}, ErrAssetInvalid
	}
	mediaType, err := NormalizeAssetMimeType(value.MimeType)
	if err != nil {
		return StoredAsset{}, err
	}
	value.MimeType = mediaType
	return value, nil
}
