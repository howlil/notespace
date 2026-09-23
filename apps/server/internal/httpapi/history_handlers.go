package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (a API) history(w http.ResponseWriter, r *http.Request) {
	data, err := a.service.ListHistory(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func (a API) historySnapshot(w http.ResponseWriter, r *http.Request) {
	data, err := a.service.GetHistory(r.Context(), r.PathValue("id"), r.PathValue("historyId"))
	if err != nil {
		fail(w, err)
		return
	}
	data.References = []workspace.Reference{}
	send(w, 200, data)
}

func (a API) restore(w http.ResponseWriter, r *http.Request) {
	restored, err := a.service.RestoreHistory(r.Context(), r.PathValue("id"), r.PathValue("historyId"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, restored)
}
