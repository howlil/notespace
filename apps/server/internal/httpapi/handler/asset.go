package handler

import (
	"net/http"
	"strconv"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

const maxAssetBytes = 8 << 20

func (h *Handler) PutAsset(w http.ResponseWriter, r *http.Request) {
	workspaceID, assetID := r.PathValue("id"), r.PathValue("assetId")
	if !domain.ValidID(assetID, domain.MaxAssetIDLength) {
		transport.Fail(w, domain.ErrAssetInvalid)
		return
	}
	mediaType, err := domain.NormalizeAssetMimeType(r.Header.Get("Content-Type"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	data, ok := transport.ReadBoundedBody(w, r, maxAssetBytes, "Image exceeds the 8 MiB asset limit")
	if !ok {
		return
	}
	if len(data) == 0 {
		transport.Fail(w, domain.ErrAssetInvalid)
		return
	}
	if _, err := h.deps.Library.PutAsset(r.Context(), domain.StoredAsset{ID: assetID, WorkspaceID: workspaceID, MimeType: mediaType, Data: data}); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) GetAsset(w http.ResponseWriter, r *http.Request) {
	value, err := h.deps.Library.GetAsset(r.Context(), r.PathValue("id"), r.PathValue("assetId"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	if _, err := domain.NormalizeAssetMimeType(value.MimeType); err != nil {
		w.Header().Set("Content-Security-Policy", "sandbox")
		w.Header().Set("Content-Disposition", "attachment")
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Type", value.MimeType)
	w.Header().Set("Content-Length", strconv.Itoa(len(value.Data)))
	w.Header().Set("X-Notespace-Created-At", value.CreatedAt)
	w.Header().Set("Cache-Control", "private,max-age=31536000,immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(value.Data)
}
