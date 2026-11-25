package httpapi_test

import (
	"bytes"
	"context"
	"database/sql"
	"github.com/howlil/notespace/apps/server/internal/infra/store"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// --- merged from asset_http_test.go ---

func TestAssetHTTPPreservesSupportedImageMimeAndBody(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "asset-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Asset HTTP"}))

	for _, tc := range []struct {
		id   string
		mime string
		body []byte
	}{
		{id: "png", mime: "image/png", body: []byte("png-body")},
		{id: "webp", mime: "image/webp", body: []byte("webp-body")},
	} {
		path := "/api/workspaces/" + workspace.ID + "/assets/" + tc.id
		upload := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(tc.body))
		upload.Header.Set("Content-Type", tc.mime)
		uploadResponse := httptest.NewRecorder()
		api.ServeHTTP(uploadResponse, upload)
		expect(t, uploadResponse, http.StatusNoContent)

		download := httptest.NewRequest(http.MethodGet, path, nil)
		downloadResponse := httptest.NewRecorder()
		api.ServeHTTP(downloadResponse, download)
		expect(t, downloadResponse, http.StatusOK)
		if got := downloadResponse.Header().Get("Content-Type"); got != tc.mime {
			t.Fatalf("asset %s content type = %q, want %q", tc.id, got, tc.mime)
		}
		if !bytes.Equal(downloadResponse.Body.Bytes(), tc.body) {
			t.Fatalf("asset %s body = %q, want %q", tc.id, downloadResponse.Body.Bytes(), tc.body)
		}
	}
}

func TestAssetHTTPRejectsSVGUpload(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "asset-svg-reject.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Asset SVG reject"}))

	path := "/api/workspaces/" + workspace.ID + "/assets/svg"
	upload := httptest.NewRequest(http.MethodPut, path, bytes.NewReader([]byte("<svg><script>alert(1)</script></svg>")))
	upload.Header.Set("Content-Type", "image/svg+xml")
	uploadResponse := httptest.NewRecorder()
	api.ServeHTTP(uploadResponse, upload)
	// SVG can run script as a document in the same origin, so it is denied at upload.
	expect(t, uploadResponse, http.StatusBadRequest)

	download := httptest.NewRequest(http.MethodGet, path, nil)
	downloadResponse := httptest.NewRecorder()
	api.ServeHTTP(downloadResponse, download)
	expect(t, downloadResponse, http.StatusNotFound)
}

func TestAssetHTTPQuarantinesLegacyStoredSVG(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "legacy-svg-asset.db")
	st, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	workspace := decodeWorkspace(t, call(t, newAPI(st), http.MethodPost, "/api/workspaces", map[string]string{"title": "Legacy SVG"}))
	if err := st.Close(); err != nil {
		t.Fatal(err)
	}

	rawDB, err := sql.Open("sqlite", filepath.ToSlash(dbPath)+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	svgPayload := []byte(`<svg><script>alert(1)</script></svg>`)
	if _, err := rawDB.ExecContext(ctx, `INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged) VALUES (?,?,?,?,?,0)`, workspace.ID, "legacy-svg", "image/svg+xml", svgPayload, "2025-01-01T00:00:00Z"); err != nil {
		_ = rawDB.Close()
		t.Fatal(err)
	}
	if err := rawDB.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	api := newAPI(reopened)

	download := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/assets/legacy-svg", nil)
	response := httptest.NewRecorder()
	api.ServeHTTP(response, download)
	expect(t, response, http.StatusOK)
	if got := response.Header().Get("Content-Type"); got != "image/svg+xml" {
		t.Fatalf("legacy SVG Content-Type = %q, want image/svg+xml", got)
	}
	if got := response.Header().Get("Content-Security-Policy"); got != "sandbox" {
		t.Fatalf("legacy SVG Content-Security-Policy = %q, want sandbox", got)
	}
	if got := response.Header().Get("Content-Disposition"); got != "attachment" {
		t.Fatalf("legacy SVG Content-Disposition = %q, want attachment", got)
	}
	if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("legacy SVG X-Content-Type-Options = %q, want nosniff", got)
	}
	if !bytes.Equal(response.Body.Bytes(), svgPayload) {
		t.Fatalf("legacy SVG body = %q, want %q", response.Body.Bytes(), svgPayload)
	}
}
