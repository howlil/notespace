package planninghttp

import (
	"github.com/howlil/notespace/apps/server/internal/planning"
)

// Handler owns planning transport and delegates product rules to application services.
type Handler struct {
	planning *planning.Service
}

func New(planning *planning.Service) Handler { return Handler{planning: planning} }
