package assetshttp

import (
	"github.com/howlil/notespace/apps/server/internal/asset"
)

// Handler owns assets transport and delegates product rules to application services.
type Handler struct {
	assets *asset.Service
}

func New(assets *asset.Service) Handler { return Handler{assets: assets} }
