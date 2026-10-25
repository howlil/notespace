package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestActivityDeleteMakesLateHeartbeatsGone(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "activity-gone.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	body := map[string]any{
		"activityDate":  "2026-10-26",
		"activeSeconds": 30,
		"activityType":  "build",
		"title":         "Activity to delete",
		"finish":        true,
	}
	path := "/api/activity/sessions/removed-session:2026-10-26"
	expect(t, call(t, api, http.MethodPut, path, body), http.StatusOK)
	expect(t, call(t, api, http.MethodDelete, "/api/activity/sessions/removed-session", nil), http.StatusNoContent)

	body["activeSeconds"] = 90
	late := call(t, api, http.MethodPut, path, body)
	expect(t, late, http.StatusGone)
	var rejected struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(late.Body.Bytes(), &rejected); err != nil {
		t.Fatal(err)
	}
	if rejected.Code != "activity_deleted" {
		t.Fatalf("late heartbeat error code = %q, want activity_deleted", rejected.Code)
	}
	body["activityDate"] = "2026-10-27"
	expect(t, call(t, api, http.MethodPut,
		"/api/activity/sessions/removed-session:2026-10-27", body), http.StatusGone)
	sessions := call(t, api, http.MethodGet, "/api/activity/sessions?limit=10", nil)
	expect(t, sessions, http.StatusOK)
	var items []json.RawMessage
	if err := json.Unmarshal(sessions.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("deleted session restored to history: %s", sessions.Body.String())
	}
}
