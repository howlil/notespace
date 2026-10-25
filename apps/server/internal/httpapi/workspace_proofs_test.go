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
	if err != nil { t.Fatal(err) }
	defer store.Close()
	api := newAPI(store)

	payload, err := json.Marshal(map[string]string{"id": "same-client-command", "title": "Same intent"})
	if err != nil { t.Fatal(err) }
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

	var canonicalNoteID string
	for response := range responses {
		if response.Code != http.StatusCreated {
			t.Fatalf("concurrent replay status %d: %s", response.Code, response.Body.String())
		}
		var created workspacepkg.Workspace
		if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil { t.Fatal(err) }
		if created.ID != "same-client-command" || len(created.Notes) != 1 {
			t.Fatalf("unexpected replay receipt: %+v", created.Summary)
		}
		if canonicalNoteID == "" { canonicalNoteID = created.Notes[0].ID }
		if created.Notes[0].ID != canonicalNoteID {
			t.Fatalf("two default Notes were created for one command: %q != %q", created.Notes[0].ID, canonicalNoteID)
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
	if err != nil { t.Fatal(err) }
	defer store.Close()
	api := newAPI(store)

	start := make(chan struct{})
	type outcome struct { title string; response *httptest.ResponseRecorder }
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
	if persisted.Title != winner { t.Fatalf("winner %q, persisted %q", winner, persisted.Title) }
	page, err := workspacepkg.NewService(store).ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Limit: 10})
	if err != nil || page.Total != 1 { t.Fatalf("unexpected workspace count %d: %v", page.Total, err) }
}

// A Note ID is scoped to its owning Workspace across reads AND writes.
// Use two Notes in the target workspace so DELETE reaches its identity lookup,
// rather than being rejected early by the last-Note invariant.
func TestNoteRoutesCannotReadOrMutateAnotherWorkspacesNote(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "note-ownership.db"))
	if err != nil { t.Fatal(err) }
	defer store.Close()
	api := newAPI(store)

	owner := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Owner"}))
	other := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Other"}))
	target := workspacepkg.NoteCreate{ID: "owned-by-a", Title: "Private Note", Document: owner.Document}
	expect(t, call(t, api, http.MethodPost, "/api/workspaces/"+owner.ID+"/notes", target), http.StatusCreated)
	expect(t, call(t, api, http.MethodPost, "/api/workspaces/"+other.ID+"/notes", workspacepkg.NoteCreate{
		ID: "owned-by-b", Title: "Other Note", Document: other.Document,
	}), http.StatusCreated)

	wrongPath := "/api/workspaces/" + other.ID + "/notes/" + target.ID
	expect(t, call(t, api, http.MethodGet, wrongPath, nil), http.StatusNotFound)
	expect(t, call(t, api, http.MethodPatch, wrongPath, workspacepkg.NoteUpdate{
		Title: "Corrupted title", Document: owner.Document, Version: 1,
	}), http.StatusNotFound)
	request := httptest.NewRequest(http.MethodDelete, wrongPath, nil)
	request.Header.Set("If-Match", "\"1\"")
	deleteResult := httptest.NewRecorder()
	api.ServeHTTP(deleteResult, request)
	expect(t, deleteResult, http.StatusNotFound)

	persistedOwner := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+owner.ID, nil))
	persistedOther := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+other.ID, nil))
	if len(persistedOwner.Notes) != 2 || persistedOwner.Notes[1].Title != target.Title || persistedOwner.Version != owner.Version+1 {
		t.Fatalf("cross-workspace mutation changed owner's data: %+v", persistedOwner.Summary)
	}
	if len(persistedOther.Notes) != 2 || persistedOther.Version != other.Version+1 {
		t.Fatalf("cross-workspace mutation changed destination's data: %+v", persistedOther.Summary)
	}
}

func TestWorkspaceMetadataNoopsDoNotIncrementVersionOrInvalidateSnapshots(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "metadata-noop.db"))
	if err != nil { t.Fatal(err) }
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
	if len(after.Notes) != 1 || after.Notes[0].ID != before.Notes[0].ID || after.CanvasVersion != before.CanvasVersion {
		t.Fatal("no-op metadata mutation replaced authored state")
	}
}
