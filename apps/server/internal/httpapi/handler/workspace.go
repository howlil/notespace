package handler

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	data, err := h.deps.Library.ListCategories(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, data)
}

func (h *Handler) ListCategoryWorkspaces(w http.ResponseWriter, r *http.Request) {
	categoryID := r.PathValue("id")
	query, err := transport.ParseWorkspaceQuery(r, categoryID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	page, err := h.deps.Library.ListCategoryWorkspaces(r.Context(), categoryID, query)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, page)
}

func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	category, err := h.deps.Library.CreateCategory(r.Context(), body.Title)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	w.Header().Set("Location", "/api/categories/"+category.ID)
	transport.SendJSON(w, http.StatusCreated, category)
}

func (h *Handler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	category, err := h.deps.Library.UpdateCategory(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, category)
}

func (h *Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.DeleteCategory(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	query, err := transport.ParseWorkspaceQuery(r, "")
	if err != nil {
		transport.Fail(w, err)
		return
	}
	page, err := h.deps.Library.ListWorkspaces(r.Context(), query)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, page)
}

func (h *Handler) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID         string `json:"id"`
		Title      string `json:"title"`
		CategoryID string `json:"categoryId"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	p, err := h.deps.Library.CreateWorkspaceWithID(r.Context(), body.ID, body.Title, body.CategoryID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	w.Header().Set("Location", "/api/workspaces/"+p.ID)
	transport.SendJSON(w, http.StatusCreated, p)
}

func (h *Handler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	p, err := h.deps.Library.GetWorkspace(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, p)
}

func (h *Handler) RenameWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title         string  `json:"title"`
		ExpectedTitle *string `json:"expectedTitle"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	p, err := h.deps.Library.RenameWorkspace(r.Context(), r.PathValue("id"), body.Title, body.ExpectedTitle)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, p)
}

func (h *Handler) MoveWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID         string  `json:"categoryId"`
		ExpectedCategoryID *string `json:"expectedCategoryId"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	p, err := h.deps.Library.MoveWorkspace(r.Context(), r.PathValue("id"), body.CategoryID, body.ExpectedCategoryID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, p)
}

func (h *Handler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	version, err := transport.ExpectedVersion(r)
	if err != nil || version == nil {
		transport.Fail(w, domain.ErrWorkspaceInvalid)
		return
	}
	if err := h.deps.Library.TrashWorkspace(r.Context(), r.PathValue("id"), *version); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) ListTrash(w http.ResponseWriter, r *http.Request) {
	items, err := h.deps.Library.ListTrash(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, items)
}

func (h *Handler) RestoreTrash(w http.ResponseWriter, r *http.Request) {
	value, err := h.deps.Library.RestoreTrashedWorkspace(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, value)
}

func (h *Handler) DeleteTrash(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.DeleteTrashedWorkspace(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) GetCanvas(w http.ResponseWriter, r *http.Request) {
	canvas, err := h.deps.Library.GetCanvasState(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, canvas)
}

func (h *Handler) UpdateCanvas(w http.ResponseWriter, r *http.Request) {
	var body domain.CanvasUpdate
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	canvas, err := h.deps.Library.UpdateCanvas(r.Context(), r.PathValue("id"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, canvas)
}
