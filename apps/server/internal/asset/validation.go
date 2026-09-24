package asset

import (
	"mime"
	"strings"
)

// NormalizeMimeType accepts only the image MIME family used by durable assets
// and removes optional parameters before persistence or transport use.
func NormalizeMimeType(value string) (string, error) {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	if err != nil || !strings.HasPrefix(strings.ToLower(mediaType), "image/") {
		return "", ErrInvalid
	}
	return mediaType, nil
}

// NormalizeStored enforces the asset invariants shared by normal uploads and
// imported library state. Path-specific constraints remain transport-owned.
func NormalizeStored(value Stored) (Stored, error) {
	value.ID = strings.TrimSpace(value.ID)
	value.WorkspaceID = strings.TrimSpace(value.WorkspaceID)
	if value.ID == "" || value.WorkspaceID == "" || len(value.Data) == 0 {
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
