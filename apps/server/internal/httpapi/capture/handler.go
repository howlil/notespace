package capturehttp

import (
	"github.com/howlil/notespace/apps/server/internal/capture"
)

// Handler owns capture transport and delegates product rules to application services.
type Handler struct {
	captures *capture.Service
}

func New(captures *capture.Service) Handler { return Handler{captures: captures} }
