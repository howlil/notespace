package domain

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

var (
	ErrIconInvalidName = apperr.Invalid("Invalid Eraser icon name")
	ErrIconNotFound    = apperr.NotFound("Eraser icon not found")
	ErrIconUnavailable = apperr.Unavailable("Could not load Eraser icon")
)

type IconEntry struct {
	Data        []byte
	ContentType string
}

// IconSource fetches and validates a sanitized SVG icon by slug.
type IconSource interface {
	Fetch(ctx context.Context, slug string) (IconEntry, error)
}
