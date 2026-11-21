package asset

import (
	"bytes"
	"mime"
	"strings"
)

// NormalizeMimeType accepts only the image MIME family used by durable assets
// and removes optional parameters before persistence or transport use. SVG is
// deliberately excluded: an SVG loaded directly as a document can execute script
// in the same origin (the asset endpoint is served inline without an isolating
// CSP), so untrusted SVG is rejected at every ingress (upload, store, restore).
func NormalizeMimeType(value string) (string, error) {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	lower := strings.ToLower(mediaType)
	if err != nil || !strings.HasPrefix(lower, "image/") || strings.HasPrefix(lower, "image/svg") ||
		strings.HasPrefix(lower, "image/xml") || strings.HasPrefix(lower, "image/html") ||
		strings.HasSuffix(lower, "+xml") || strings.HasSuffix(lower, "+html") {
		return "", ErrInvalid
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

// NormalizeStored enforces the asset invariants shared by normal uploads and
// imported library state. Path-specific constraints remain transport-owned.
func NormalizeStored(value Stored) (Stored, error) {
	value.ID = strings.TrimSpace(value.ID)
	value.WorkspaceID = strings.TrimSpace(value.WorkspaceID)
	if value.ID == "" || value.WorkspaceID == "" || len(value.Data) == 0 || looksLikeMarkupDocument(value.Data) {
		return Stored{}, ErrInvalid
	}
	mediaType, err := NormalizeMimeType(value.MimeType)
	if err != nil {
		return Stored{}, err
	}
	value.MimeType = mediaType
	return value, nil
}

func ValidateStored(value Stored) error {
	_, err := NormalizeStored(value)
	return err
}
