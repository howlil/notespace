package httpapi

import "net/http"

func (a API) search(w http.ResponseWriter, r *http.Request) {
	data, err := a.workspace.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
