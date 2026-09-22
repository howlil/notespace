package httpapi

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/project"
)

const maxAssetBytes = 8 << 20

func validAssetID(value string) bool {
	return value != "" && len(value) <= 160 && !strings.ContainsAny(value, "/\\")
}

func (a API) putAsset(w http.ResponseWriter, r *http.Request) {
	workspaceID, assetID := r.PathValue("id"), r.PathValue("assetId")
	if !validAssetID(assetID) {
		fail(w, asset.ErrInvalid)
		return
	}
	exists, err := a.service.WorkspaceExists(r.Context(), workspaceID)
	if err != nil {
		fail(w, err)
		return
	}
	if !exists {
		fail(w, project.ErrNotFound)
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.HasPrefix(mediaType, "image/") {
		fail(w, asset.ErrInvalid)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAssetBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			send(w, 413, map[string]string{"error": "Image exceeds the 8 MiB asset limit"})
			return
		}
		fail(w, err)
		return
	}
	if len(data) == 0 {
		fail(w, asset.ErrInvalid)
		return
	}
	_, err = a.assets.PutAsset(r.Context(), asset.Stored{ID: assetID, WorkspaceID: workspaceID, MimeType: mediaType, Data: data})
	if err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a API) getAsset(w http.ResponseWriter, r *http.Request) {
	value, err := a.assets.GetAsset(r.Context(), r.PathValue("id"), r.PathValue("assetId"))
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Content-Type", value.MimeType)
	w.Header().Set("Content-Length", strconv.Itoa(len(value.Data)))
	w.Header().Set("X-Notespace-Created-At", value.CreatedAt)
	w.Header().Set("Cache-Control", "private,max-age=31536000,immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(value.Data)
}

func (a API) deleteAsset(w http.ResponseWriter, r *http.Request) {
	if err := a.assets.DeleteAsset(r.Context(), r.PathValue("id"), r.PathValue("assetId")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
