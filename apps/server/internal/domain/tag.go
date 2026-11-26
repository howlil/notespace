package domain

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

const MaxTagNameRunes = 64

type Tag struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	NormalizedKey string `json:"normalizedKey"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type NoteTag struct {
	NoteID    string `json:"noteId"`
	TagID     string `json:"tagId"`
	CreatedAt string `json:"createdAt"`
}

type BatchNoteTagsRequest struct {
	NoteIDs      []string `json:"noteIds"`
	AddTagIDs    []string `json:"addTagIds,omitempty"`
	RemoveTagIDs []string `json:"removeTagIds,omitempty"`
}

// NormalizeTagKey returns the canonical case-folded lookup key for a tag name.
func NormalizeTagKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// ValidateTagName trims and validates a tag display name, returning the
// trimmed name and its normalized key.
func ValidateTagName(name string) (string, string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || !utf8.ValidString(trimmed) || utf8.RuneCountInString(trimmed) > MaxTagNameRunes {
		return "", "", ErrTagInvalid
	}
	for _, r := range trimmed {
		if unicode.IsControl(r) {
			return "", "", ErrTagInvalid
		}
	}
	return trimmed, NormalizeTagKey(trimmed), nil
}

// ValidateTag validates a persisted or backed-up Tag record.
func ValidateTag(tag Tag) error {
	if !ValidID(tag.ID, MaxIDLength) || tag.CreatedAt == "" || tag.UpdatedAt == "" {
		return ErrTagInvalid
	}
	trimmed, key, err := ValidateTagName(tag.Name)
	if err != nil || tag.Name != trimmed || tag.NormalizedKey != key {
		return ErrTagInvalid
	}
	return nil
}
