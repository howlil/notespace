package libraryhttp

import (
	"github.com/howlil/notespace/apps/server/internal/library"
)

// Handler owns library transport and delegates product rules to application services.
type Handler struct {
	library *library.Service
}

func New(library *library.Service) Handler { return Handler{library: library} }
