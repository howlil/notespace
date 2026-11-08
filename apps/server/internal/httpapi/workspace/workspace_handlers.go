package workspacehttp

import (
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (a Handler) List(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("limit") != "" {
		limit, err := transport.ParseIntQuery(r, "limit", 0)
		if err != nil || limit < 1 || limit > 100 {
			transport.Fail(w, workspace.ErrInvalid)
			return
		}
		data, err := a.workspace.ListRecent(r.Context(), limit)
		if err != nil {
			transport.Fail(w, err)
			return
		}
		transport.Send(w, 200, data)
		return
	}
	data, err := a.workspace.List(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, data)
}

func (a Handler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	query, err := transport.WorkspaceQuery(r, "")
	if err != nil {
		transport.Fail(w, err)
		return
	}
	page, err := a.workspace.ListWorkspaces(r.Context(), query)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, page)
}

func (a Handler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID         string `json:"id"`
		Title      string `json:"title"`
		CategoryID string `json:"categoryId"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	p, err := a.workspace.CreateWithID(r.Context(), body.ID, body.Title, body.CategoryID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	locationPrefix := "/api/workspaces/"
	if transport.IsLegacyProjectPath(r.URL.Path) {
		locationPrefix = "/api/projects/"
	}
	w.Header().Set("Location", locationPrefix+p.ID)
	transport.Send(w, 201, p)
}

func (a Handler) Get(w http.ResponseWriter, r *http.Request) {
	p, err := a.workspace.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, p)
}

func (a Handler) Update(w http.ResponseWriter, r *http.Request) {
	var body workspace.Update
	if !transport.Decode(w, r, &body) {
		return
	}
	p, err := a.workspace.Update(r.Context(), r.PathValue("id"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, p)
}

func (a Handler) Rename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title         string  `json:"title"`
		ExpectedTitle *string `json:"expectedTitle"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	var expected []string
	if body.ExpectedTitle != nil {
		expected = append(expected, *body.ExpectedTitle)
	}
	p, err := a.workspace.Rename(r.Context(), r.PathValue("id"), body.Title, expected...)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, p)
}

func (a Handler) Move(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID         string  `json:"categoryId"`
		ExpectedCategoryID *string `json:"expectedCategoryId"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	var expected []string
	if body.ExpectedCategoryID != nil {
		expected = append(expected, *body.ExpectedCategoryID)
	}
	p, err := a.workspace.Move(r.Context(), r.PathValue("id"), body.CategoryID, expected...)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, p)
}

func (a Handler) Delete(w http.ResponseWriter, r *http.Request) {
	version, err := transport.ExpectedVersion(r)
	if err != nil || version == nil {
		transport.Fail(w, workspace.ErrInvalid)
		return
	}
	if err := a.library.TrashWorkspace(r.Context(), r.PathValue("id"), *version); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}
