package iconshttp

import (
	"github.com/howlil/notespace/apps/server/internal/icon"
)

// Handler owns icons transport and delegates product rules to application services.
type Handler struct {
	eraserIcons icon.Source
}

func New(eraserIcons icon.Source) Handler { return Handler{eraserIcons: eraserIcons} }
