// Package handler implements thin capability-oriented HTTP endpoint handlers
// that translate requests onto library.Store and icon.Source.
package handler

import (
	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/store"
)

type Dependencies struct {
	Library *store.Store
	Icons   domain.IconSource
}

type Handler struct {
	deps Dependencies
}

func New(deps Dependencies) *Handler {
	return &Handler{deps: deps}
}
