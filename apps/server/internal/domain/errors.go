// Package domain defines Notespace's pure product models, validation rules,
// domain error sentinels, and document/scene parsers with zero SQL or HTTP
// dependencies.
package domain

import (
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

const (
	// UncategorizedCategoryID is the compatibility seed category used when a
	// workspace is created without an explicit category.
	UncategorizedCategoryID = "legacy"

	MaxIDLength                  = 128
	MaxAssetIDLength             = 160
	InternalAssetPathPrefix      = "/api/workspaces/"
	InternalWorkspaceRoutePrefix = "/workspaces/"
	ReusableIconAssetPrefix      = "eraser-icon-"
)

var (
	ErrWorkspaceNotFound = apperr.NotFound("Workspace not found")
	ErrWorkspaceInvalid  = apperr.Invalid("Invalid title, content, or version")
	ErrWorkspaceConflict = apperr.Conflict("workspace_conflict", "This workspace changed in another tab. Your edits remain here; reload only after preserving them.")
	ErrCategoryNotEmpty  = apperr.NotEmpty("", "Delete or move the workspaces in this category first.")

	ErrNoteNotFound = apperr.NotFound("Note or Canvas instance not found")
	ErrNoteInvalid  = apperr.Invalid("Invalid note document, Canvas reference, geometry, or version")
	ErrNoteConflict = apperr.Conflict("note_conflict", "This note or Canvas changed in another session. Your draft remains available for recovery.")
	ErrNoteNotEmpty = apperr.NotEmpty("note_not_empty", "This Note has content and cannot be deleted here.")
	ErrNoteTrashed  = apperr.Conflict("note_trashed", "This Note is in Trash. Restore it to edit or place it.")
	ErrNoteInUse    = apperr.Conflict("note_in_use", "This Note is still placed on a Canvas.")

	ErrAssetNotFound = apperr.NotFound("Image asset not found")
	ErrAssetInvalid  = apperr.Invalid("Invalid image asset")

	ErrBackupInvalid = apperr.Invalid("Invalid backup archive")
)

func ValidID(value string, maxLen int) bool {
	return value != "" && len(value) <= maxLen && strings.TrimSpace(value) == value && !strings.ContainsAny(value, "/\\")
}
