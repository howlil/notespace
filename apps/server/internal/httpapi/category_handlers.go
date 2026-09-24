package httpapi

import "net/http"

func (a API) listCategories(w http.ResponseWriter, r *http.Request) {
	data, err := a.workspace.ListCategories(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func (a API) listCategoryWorkspaces(w http.ResponseWriter, r *http.Request) {
	categoryID := r.PathValue("id")
	query, err := workspaceQuery(r, categoryID)
	if err != nil {
		fail(w, err)
		return
	}
	page, err := a.workspace.ListCategoryWorkspaces(r.Context(), categoryID, query)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, page)
}

func (a API) createCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	category, err := a.workspace.CreateCategory(r.Context(), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Location", "/api/categories/"+category.ID)
	send(w, 201, category)
}

func (a API) updateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	category, err := a.workspace.UpdateCategory(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, category)
}

func (a API) deleteCategory(w http.ResponseWriter, r *http.Request) {
	if err := a.library.DeleteCategory(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}
