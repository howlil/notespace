package workspacehttp

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

// Handler owns workspace transport and delegates product rules to application services.
type Handler struct {
	library   *library.Service
	workspace *workspace.Service
}

func New(library *library.Service, workspace *workspace.Service) Handler {
	return Handler{library: library, workspace: workspace}
}

func optionalExpected(value *string) []string {
	if value == nil {
		return nil
	}
	return []string{*value}
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
	transport.Send(w, http.StatusOK, page)
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
	w.Header().Set("Location", "/api/workspaces/"+p.ID)
	transport.Send(w, http.StatusCreated, p)
}

func (a Handler) Get(w http.ResponseWriter, r *http.Request) {
	p, err := a.workspace.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, p)
}

func (a Handler) Rename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title         string  `json:"title"`
		ExpectedTitle *string `json:"expectedTitle"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	p, err := a.workspace.Rename(r.Context(), r.PathValue("id"), body.Title, optionalExpected(body.ExpectedTitle)...)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, p)
}

func (a Handler) Move(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID         string  `json:"categoryId"`
		ExpectedCategoryID *string `json:"expectedCategoryId"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	p, err := a.workspace.Move(r.Context(), r.PathValue("id"), body.CategoryID, optionalExpected(body.ExpectedCategoryID)...)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, p)
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

func (a Handler) Search(w http.ResponseWriter, r *http.Request) {
	data, err := a.workspace.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, data)
}
