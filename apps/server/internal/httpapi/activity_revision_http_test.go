package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestActivityHeartbeatRevisionContractAndTerminalAcknowledgement(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "activity-revision-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	path := "/api/activity/sessions/revision-http:2026-10-26"
	body := map[string]any{
		"activityDate":  "2026-10-26",
		"activeSeconds": 120,
		"finish":        false,
		"activityType":  "build",
		"title":         "Latest context",
		"revision":      3,
	}
	expect(t, call(t, api, http.MethodPut, path, body), http.StatusOK)

	body["revision"] = 2
	body["title"] = "Stale context"
	r := call(t, api, http.MethodPut, path, body)
	expect(t, r, http.StatusOK)
	var session struct {
		Title         string  `json:"title"`
		Revision      int64   `json:"revision"`
		ActiveSeconds int64   `json:"activeSeconds"`
		EndedAt       *string `json:"endedAt"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	if session.Title != "Latest context" || session.Revision != 3 {
		t.Fatalf("stale PUT regressed metadata: %+v", session)
	}

	body["revision"] = 0 // Already-queued legacy End must remain valid.
	body["finish"] = true
	body["activeSeconds"] = 60
	r = call(t, api, http.MethodPut, path, body)
	expect(t, r, http.StatusOK)
	if err := json.Unmarshal(r.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	if session.EndedAt == nil || session.ActiveSeconds != 120 || session.Revision != 3 {
		t.Fatalf("HTTP 200 must indicate committed finalization: %+v", session)
	}

	body["revision"] = -1
	expect(t, call(t, api, http.MethodPut, path, body), http.StatusBadRequest)
}
