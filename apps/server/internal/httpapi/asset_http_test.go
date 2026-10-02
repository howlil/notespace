package httpapi_test

import (
	"bytes"
	"context"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
	"net/http"
	"net/http/httptest"
	"path/filepath"
)

func TestAssetHTTPPreservesSupportedImageMimeAndBody(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "asset-http.db"))
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
		{id: "svg", mime: "image/svg+xml", body: []byte("<svg/>")},
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
