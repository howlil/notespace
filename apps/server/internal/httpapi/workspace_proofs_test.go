package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// Proves idempotency across overlapping requests, not just two sequential POSTs.
// Both handlers can observe the same missing ID before either INSERT commits.
func TestConcurrentWorkspaceCreateWithSameIdentityHasOneDurableEffect(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "concurrent-create.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	payload, err := json.Marshal(map[string]string{"id": "same-client-command", "title": "Same intent"})
	if err != nil {
		t.Fatal(err)
	}
	const callers = 8
	var wg sync.WaitGroup
	start := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, callers)
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			request := httptest.NewRequest(http.MethodPost, "/api/workspaces", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			api.ServeHTTP(response, request)
			responses <- response
		}()
	}
	close(start)
	wg.Wait()
	close(responses)

	for response := range responses {
		if response.Code != http.StatusCreated {
			t.Fatalf("concurrent replay status %d: %s", response.Code, response.Body.String())
		}
		var created workspacepkg.Workspace
		if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
			t.Fatal(err)
		}
		if created.ID != "same-client-command" || len(created.Notes) != 0 {
			t.Fatalf("unexpected replay receipt: %+v", created.Summary)
		}
	}
	page, err := workspacepkg.NewService(store).ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Limit: 10})
	if err != nil || page.Total != 1 {
		t.Fatalf("concurrent CREATE produced total=%d, err=%v", page.Total, err)
	}
}

func TestWorkspaceCreateIdentityRejectsConcurrentDifferentPayloads(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "concurrent-different-intents.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	start := make(chan struct{})
	type outcome struct {
		title    string
		response *httptest.ResponseRecorder
	}
	results := make(chan outcome, 2)
	var wg sync.WaitGroup
	for _, title := range []string{"First intention", "Second intention"} {
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			payload, _ := json.Marshal(map[string]string{"id": "reused-id", "title": title})
			<-start
			request := httptest.NewRequest(http.MethodPost, "/api/workspaces", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			api.ServeHTTP(response, request)
			results <- outcome{title, response}
		}(title)
	}
	close(start)
	wg.Wait()
	close(results)

	successes, conflicts := 0, 0
	var winner string
	for result := range results {
		switch result.response.Code {
		case http.StatusCreated:
			successes++
			winner = result.title
		case http.StatusConflict:
			conflicts++
		default:
			t.Fatalf("%q returned %d: %s", result.title, result.response.Code, result.response.Body.String())
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("expected one winner and one conflict, got successes=%d conflicts=%d", successes, conflicts)
	}
	persisted := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/reused-id", nil))
	if persisted.Title != winner {
		t.Fatalf("winner %q, persisted %q", winner, persisted.Title)
	}
	page, err := workspacepkg.NewService(store).ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Limit: 10})
	if err != nil || page.Total != 1 {
		t.Fatalf("unexpected workspace count %d: %v", page.Total, err)
	}
}

func TestWorkspaceMetadataNoopsDoNotIncrementVersionOrInvalidateSnapshots(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "metadata-noop.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	before := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Unchanged"}))
	rename := decodeWorkspace(t, call(t, api, http.MethodPatch, "/api/workspaces/"+before.ID+"/title", map[string]string{
		"title": before.Title, "expectedTitle": before.Title,
	}))
	move := decodeWorkspace(t, call(t, api, http.MethodPatch, "/api/workspaces/"+before.ID+"/category", map[string]string{
		"categoryId": before.CategoryID, "expectedCategoryId": before.CategoryID,
	}))
	after := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+before.ID, nil))
	if rename.Version != before.Version || move.Version != before.Version || after.Version != before.Version {
		t.Fatalf("no-op metadata mutation advanced version: before=%d rename=%d move=%d after=%d", before.Version, rename.Version, move.Version, after.Version)
	}
	if len(after.Notes) != 0 || after.CanvasVersion != before.CanvasVersion {
		t.Fatal("no-op metadata mutation replaced authored state")
	}
}
