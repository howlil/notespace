package assetshttp

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
)

const maxAssetBytes = 8 << 20

// Handler owns assets transport and delegates product rules to application services.
type Handler struct {
	assets *asset.Service
}

func New(assets *asset.Service) Handler { return Handler{assets: assets} }

func validAssetID(value string) bool {
	return value != "" && len(value) <= 160 && !strings.ContainsAny(value, "/\\")
}

func (a Handler) PutAsset(w http.ResponseWriter, r *http.Request) {
	workspaceID, assetID := r.PathValue("id"), r.PathValue("assetId")
	if !validAssetID(assetID) {
		transport.Fail(w, asset.ErrInvalid)
		return
	}
	mediaType, err := asset.NormalizeMimeType(r.Header.Get("Content-Type"))
	if err != nil {
		transport.Fail(w, asset.ErrInvalid)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAssetBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			transport.Send(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Image exceeds the 8 MiB asset limit"})
			return
		}
		transport.Fail(w, err)
		return
	}
	if len(data) == 0 {
		transport.Fail(w, asset.ErrInvalid)
		return
	}
	if _, err := a.assets.Put(r.Context(), asset.Stored{ID: assetID, WorkspaceID: workspaceID, MimeType: mediaType, Data: data}); err != nil {
		transport.Fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a Handler) GetAsset(w http.ResponseWriter, r *http.Request) {
	value, err := a.assets.Get(r.Context(), r.PathValue("id"), r.PathValue("assetId"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	if _, err := asset.NormalizeMimeType(value.MimeType); err != nil {
		// Pre-DEC8 stored assets (such as uploaded SVG files) must stay downloadable
		// without executing active scripts in the application origin.
		w.Header().Set("Content-Security-Policy", "sandbox")
		w.Header().Set("Content-Disposition", "attachment")
		w.Header().Set("X-Content-Type-Options", "nosniff")
	}
	w.Header().Set("Content-Type", value.MimeType)
	w.Header().Set("Content-Length", strconv.Itoa(len(value.Data)))
	w.Header().Set("X-Notespace-Created-At", value.CreatedAt)
	w.Header().Set("Cache-Control", "private,max-age=31536000,immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(value.Data)
}
