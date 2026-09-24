package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (a API) createNote(w http.ResponseWriter, r *http.Request) {
	var body workspace.NoteCreate
	if !decode(w, r, &body) {
		return
	}
	note, err := a.workspace.CreateNote(r.Context(), r.PathValue("id"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusCreated, note)
}

func (a API) updateNote(w http.ResponseWriter, r *http.Request) {
	var body workspace.NoteUpdate
	if !decode(w, r, &body) {
		return
	}
	note, err := a.workspace.UpdateNote(r.Context(), r.PathValue("id"), r.PathValue("noteId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, note)
}

func (a API) deleteNote(w http.ResponseWriter, r *http.Request) {
	version, err := expectedVersion(r)
	if err != nil || version == nil {
		fail(w, workspace.ErrInvalid)
		return
	}
	if err := a.workspace.DeleteNote(r.Context(), r.PathValue("id"), r.PathValue("noteId"), *version); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}
