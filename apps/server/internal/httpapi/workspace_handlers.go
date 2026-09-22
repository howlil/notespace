package httpapi

import (
	"net/http"
	"strconv"

	"github.com/howlil/notespace/apps/server/internal/project"
)

func (a API) list(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("limit") != "" {
		limit, err := parseIntQuery(r, "limit", 0)
		if err != nil || limit < 1 || limit > 100 {
			fail(w, project.ErrInvalid)
			return
		}
		data, err := a.service.ListRecent(r.Context(), limit)
		if err != nil {
			fail(w, err)
			return
		}
		send(w, 200, data)
		return
	}
	data, err := a.service.List(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func parseIntQuery(r *http.Request, key string, fallback int) (int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, project.ErrInvalid
	}
	return value, nil
}

func parseBoolQuery(r *http.Request, key string) (bool, error) {
	switch r.URL.Query().Get(key) {
	case "", "false", "0":
		return false, nil
	case "true", "1":
		return true, nil
	default:
		return false, project.ErrInvalid
	}
}

func workspaceQuery(r *http.Request, categoryID string) (project.WorkspaceQuery, error) {
	hasCanvas, err := parseBoolQuery(r, "hasCanvas")
	if err != nil {
		return project.WorkspaceQuery{}, err
	}
	hasNotes, err := parseBoolQuery(r, "hasNotes")
	if err != nil {
		return project.WorkspaceQuery{}, err
	}
	offset, err := parseIntQuery(r, "offset", 0)
	if err != nil || offset < 0 {
		return project.WorkspaceQuery{}, project.ErrInvalid
	}
	limit, err := parseIntQuery(r, "limit", 50)
	if err != nil || limit < 1 || limit > 100 {
		return project.WorkspaceQuery{}, project.ErrInvalid
	}
	sortBy := r.URL.Query().Get("sort")
	switch sortBy {
	case "", "created", "name", "notes":
	default:
		return project.WorkspaceQuery{}, project.ErrInvalid
	}
	return project.WorkspaceQuery{
		CategoryID: categoryID,
		Query:      r.URL.Query().Get("q"),
		Sort:       sortBy,
		HasCanvas:  hasCanvas,
		HasNotes:   hasNotes,
		Offset:     offset,
		Limit:      limit,
	}, nil
}

func (a API) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	query, err := workspaceQuery(r, "")
	if err != nil {
		fail(w, err)
		return
	}
	page, err := a.service.ListWorkspaces(r.Context(), query)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, page)
}

func (a API) listCategories(w http.ResponseWriter, r *http.Request) {
	data, err := a.service.ListCategories(r.Context())
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
	page, err := a.service.ListCategoryWorkspaces(r.Context(), categoryID, query)
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
	category, err := a.service.CreateCategory(r.Context(), body.Title)
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
	category, err := a.service.UpdateCategory(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, category)
}

func (a API) deleteCategory(w http.ResponseWriter, r *http.Request) {
	if err := a.service.DeleteCategory(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	send(w, 204, nil)
}

func (a API) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title      string `json:"title"`
		CategoryID string `json:"categoryId"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Create(r.Context(), body.Title, body.CategoryID)
	if err != nil {
		fail(w, err)
		return
	}
	locationPrefix := "/api/workspaces/"
	if isLegacyProjectPath(r.URL.Path) {
		locationPrefix = "/api/projects/"
	}
	w.Header().Set("Location", locationPrefix+p.ID)
	send(w, 201, p)
}

func (a API) get(w http.ResponseWriter, r *http.Request) {
	p, err := a.service.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) update(w http.ResponseWriter, r *http.Request) {
	var body project.Update
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Update(r.Context(), r.PathValue("id"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) createNote(w http.ResponseWriter, r *http.Request) {
	var body project.NoteCreate
	if !decode(w, r, &body) {
		return
	}
	note, err := a.service.CreateNote(r.Context(), r.PathValue("id"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusCreated, note)
}

func (a API) updateNote(w http.ResponseWriter, r *http.Request) {
	var body project.NoteUpdate
	if !decode(w, r, &body) {
		return
	}
	note, err := a.service.UpdateNote(r.Context(), r.PathValue("id"), r.PathValue("noteId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, note)
}

func (a API) deleteNote(w http.ResponseWriter, r *http.Request) {
	version, err := expectedVersion(r)
	if err != nil || version == nil {
		fail(w, project.ErrInvalid)
		return
	}
	if err := a.service.DeleteNote(r.Context(), r.PathValue("id"), r.PathValue("noteId"), *version); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}

func (a API) getCanvas(w http.ResponseWriter, r *http.Request) {
	canvas, err := a.service.GetCanvasState(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, canvas)
}

func (a API) updateCanvas(w http.ResponseWriter, r *http.Request) {
	var body project.CanvasUpdate
	if !decode(w, r, &body) {
		return
	}
	canvas, err := a.service.UpdateCanvas(r.Context(), r.PathValue("id"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, canvas)
}

func (a API) rename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Rename(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) move(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID string `json:"categoryId"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Move(r.Context(), r.PathValue("id"), body.CategoryID)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) delete(w http.ResponseWriter, r *http.Request) {
	if err := a.service.Delete(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	send(w, 204, nil)
}
