package workspacehttp

import "github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
import "net/http"

func (a Handler) Search(w http.ResponseWriter, r *http.Request) {
	data, err := a.workspace.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, data)
}
