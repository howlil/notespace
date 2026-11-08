package assetshttp

import (
	"errors"
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/asset"
)

const maxAssetBytes = 8 << 20

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
			transport.Send(w, 413, map[string]string{"error": "Image exceeds the 8 MiB asset limit"})
			return
		}
		transport.Fail(w, err)
		return
	}
	if len(data) == 0 {
		transport.Fail(w, asset.ErrInvalid)
		return
	}
	_, err = a.assets.Put(r.Context(), asset.Stored{ID: assetID, WorkspaceID: workspaceID, MimeType: mediaType, Data: data})
	if err != nil {
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
	w.Header().Set("Content-Type", value.MimeType)
	w.Header().Set("Content-Length", strconv.Itoa(len(value.Data)))
	w.Header().Set("X-Notespace-Created-At", value.CreatedAt)
	w.Header().Set("Cache-Control", "private,max-age=31536000,immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(value.Data)
}

func (a Handler) DeleteAsset(w http.ResponseWriter, r *http.Request) {
	if err := a.assets.Delete(r.Context(), r.PathValue("id"), r.PathValue("assetId")); err != nil {
		transport.Fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
