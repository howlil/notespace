package workspacehttp

import "github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
import "net/http"

func (a Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	data, err := a.workspace.ListCategories(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, data)
}

func (a Handler) ListCategoryWorkspaces(w http.ResponseWriter, r *http.Request) {
	categoryID := r.PathValue("id")
	query, err := transport.WorkspaceQuery(r, categoryID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	page, err := a.workspace.ListCategoryWorkspaces(r.Context(), categoryID, query)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, page)
}

func (a Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	category, err := a.workspace.CreateCategory(r.Context(), body.Title)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	w.Header().Set("Location", "/api/categories/"+category.ID)
	transport.Send(w, 201, category)
}

func (a Handler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	category, err := a.workspace.UpdateCategory(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, category)
}

func (a Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	if err := a.library.DeleteCategory(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}
