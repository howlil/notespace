package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (a API) list(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("limit") != "" {
		limit, err := parseIntQuery(r, "limit", 0)
		if err != nil || limit < 1 || limit > 100 {
			fail(w, workspace.ErrInvalid)
			return
		}
		data, err := a.workspace.ListRecent(r.Context(), limit)
		if err != nil {
			fail(w, err)
			return
		}
		send(w, 200, data)
		return
	}
	data, err := a.workspace.List(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func (a API) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	query, err := workspaceQuery(r, "")
	if err != nil {
		fail(w, err)
		return
	}
	page, err := a.workspace.ListWorkspaces(r.Context(), query)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, page)
}

func (a API) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title      string `json:"title"`
		CategoryID string `json:"categoryId"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.workspace.Create(r.Context(), body.Title, body.CategoryID)
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
	p, err := a.workspace.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) update(w http.ResponseWriter, r *http.Request) {
	var body workspace.Update
	if !decode(w, r, &body) {
		return
	}
	p, err := a.workspace.Update(r.Context(), r.PathValue("id"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) rename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.workspace.Rename(r.Context(), r.PathValue("id"), body.Title)
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
	p, err := a.workspace.Move(r.Context(), r.PathValue("id"), body.CategoryID)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) delete(w http.ResponseWriter, r *http.Request) {
	version, err := expectedVersion(r)
	if err != nil {
		fail(w, err)
		return
	}
	if err := a.library.TrashWorkspace(r.Context(), r.PathValue("id"), version); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}
