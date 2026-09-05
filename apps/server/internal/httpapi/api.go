package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/internal/study"
)

const maxAssetBytes = 8 << 20

type indexedSearcher interface {
	SearchIndexed(context.Context, string) ([]project.SearchResult, error)
}

type API struct {
	service project.Service
	study   study.Service
	assets  asset.Store
	health  func(context.Context) error
}

func New(store project.Store, health func(context.Context) error) http.Handler {
	studyStore, ok := store.(study.Store)
	if !ok {
		panic("httpapi: store does not implement study.Store")
	}
	assetStore, ok := store.(asset.Store)
	if !ok {
		panic("httpapi: store does not implement asset.Store")
	}
	a := API{service: project.Service{Store: store}, study: study.Service{Store: studyStore}, assets: assetStore, health: health}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := a.health(r.Context()); err != nil {
			fail(w, err)
			return
		}
		send(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/projects", a.list)
	mux.HandleFunc("GET /api/workspaces", a.listWorkspaces)
	mux.HandleFunc("POST /api/projects", a.create)
	mux.HandleFunc("GET /api/categories", a.listCategories)
	mux.HandleFunc("GET /api/categories/{id}/workspaces", a.listCategoryWorkspaces)
	mux.HandleFunc("POST /api/categories", a.createCategory)
	mux.HandleFunc("PATCH /api/categories/{id}", a.updateCategory)
	mux.HandleFunc("DELETE /api/categories/{id}", a.deleteCategory)
	mux.HandleFunc("GET /api/projects/{id}", a.get)
	mux.HandleFunc("PATCH /api/projects/{id}", a.update)
	mux.HandleFunc("PATCH /api/projects/{id}/title", a.rename)
	mux.HandleFunc("PATCH /api/projects/{id}/category", a.move)
	mux.HandleFunc("GET /api/projects/{id}/export", a.export)
	mux.HandleFunc("GET /api/projects/{id}/history", a.history)
	mux.HandleFunc("GET /api/projects/{id}/history/{historyId}", a.historySnapshot)
	mux.HandleFunc("POST /api/projects/{id}/history/{historyId}/restore", a.restore)
	mux.HandleFunc("DELETE /api/projects/{id}", a.delete)
	mux.HandleFunc("GET /api/workspaces/{id}/assets/{assetId}", a.getAsset)
	mux.HandleFunc("PUT /api/workspaces/{id}/assets/{assetId}", a.putAsset)
	mux.HandleFunc("DELETE /api/workspaces/{id}/assets/{assetId}", a.deleteAsset)
	mux.HandleFunc("PUT /api/workspaces/{id}/study-sessions/{sessionId}", a.studyHeartbeat)
	mux.HandleFunc("GET /api/workspaces/{id}/study", a.workspaceStudy)
	mux.HandleFunc("GET /api/study/activity", a.activity)
	mux.HandleFunc("GET /api/study/activity/{date}", a.dayDetail)
	mux.HandleFunc("GET /api/search", a.search)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { send(w, 404, map[string]string{"error": "Not found"}) })
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" {
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				send(w, 403, map[string]string{"error": "Cross-site request rejected"})
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host && origin != "https://"+r.Host {
				send(w, 403, map[string]string{"error": "Origin rejected"})
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		send(w, 415, map[string]string{"error": "Expected application/json"})
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	err = decoder.Decode(dst)
	if err == nil {
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			err = project.ErrInvalid
		}
	}
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			send(w, 413, map[string]string{"error": "Workspace exceeds the 10 MiB limit"})
		} else {
			send(w, 400, map[string]string{"error": "Invalid JSON request"})
		}
		return false
	}
	return true
}

func send(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if value != nil {
		_ = json.NewEncoder(w).Encode(value)
	}
}

func fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, project.ErrNotFound):
		send(w, 404, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, project.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid title, content, version, or split ratio"})
	case errors.Is(err, project.ErrConflict):
		send(w, 409, map[string]string{"error": "This workspace changed in another tab. Your edits remain here; reload only after preserving them.", "code": "workspace_conflict"})
	case errors.Is(err, project.ErrNotEmpty):
		send(w, 409, map[string]string{"error": "Delete or move the workspaces in this category first."})
	case errors.Is(err, asset.ErrNotFound):
		send(w, 404, map[string]string{"error": "Image asset not found"})
	case errors.Is(err, asset.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid image asset"})
	case errors.Is(err, study.ErrNotFound):
		send(w, 404, map[string]string{"error": "Study session not found"})
	case errors.Is(err, study.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid study activity"})
	default:
		slog.Error("workspace operation failed", "error", err)
		send(w, 500, map[string]string{"error": "Unable to access workspace storage. Please retry."})
	}
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if r.URL.Query().Get("limit") != "" {
		data, err := a.service.Store.ListRecent(r.Context(), limit)
		if err != nil {
			fail(w, err)
			return
		}
		send(w, 200, data)
		return
	}
	data, err := a.service.Store.List(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func parseIntQuery(r *http.Request, key string, fallback int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(key))
	if err != nil {
		return fallback
	}
	return value
}

func (a API) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	page, err := a.service.Store.ListCategoryWorkspaces(r.Context(), "", r.URL.Query().Get("q"), r.URL.Query().Get("sort"), r.URL.Query().Get("hasCanvas"), r.URL.Query().Get("hasNotes"), parseIntQuery(r, "offset", 0), parseIntQuery(r, "limit", 50))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, page)
}
func (a API) listCategories(w http.ResponseWriter, r *http.Request) {
	data, err := a.service.Store.ListCategories(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
func (a API) listCategoryWorkspaces(w http.ResponseWriter, r *http.Request) {
	exists, err := a.service.Store.CategoryExists(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	if !exists {
		fail(w, project.ErrNotFound)
		return
	}
	page, err := a.service.Store.ListCategoryWorkspaces(r.Context(), r.PathValue("id"), r.URL.Query().Get("q"), r.URL.Query().Get("sort"), r.URL.Query().Get("hasCanvas"), r.URL.Query().Get("hasNotes"), parseIntQuery(r, "offset", 0), parseIntQuery(r, "limit", 50))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, page)
}
func (a API) createCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	category, err := a.service.CreateCategory(r.Context(), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Location", "/api/categories/"+category.ID)
	send(w, 201, category)
}
func (a API) updateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	category, err := a.service.UpdateCategory(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, category)
}
func (a API) deleteCategory(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(r.PathValue("id")) == "" || r.PathValue("id") == "legacy" {
		fail(w, project.ErrInvalid)
		return
	}
	if err := a.service.Store.DeleteCategory(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	send(w, 204, nil)
}
func (a API) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title      string `json:"title"`
		CategoryID string `json:"categoryId"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Create(r.Context(), body.Title, body.CategoryID)
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Location", "/api/projects/"+p.ID)
	send(w, 201, p)
}
func (a API) get(w http.ResponseWriter, r *http.Request) {
	p, err := a.service.Store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}
func (a API) update(w http.ResponseWriter, r *http.Request) {
	var body project.Update
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Update(r.Context(), r.PathValue("id"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}
func (a API) rename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Rename(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}
func (a API) move(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID string `json:"categoryId"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Move(r.Context(), r.PathValue("id"), body.CategoryID)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, p)
}

func (a API) search(w http.ResponseWriter, r *http.Request) {
	if indexed, ok := a.service.Store.(indexedSearcher); ok {
		data, err := indexed.SearchIndexed(r.Context(), r.URL.Query().Get("q"))
		if err != nil {
			fail(w, err)
			return
		}
		send(w, 200, data)
		return
	}
	data, err := a.service.Store.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func validAssetID(value string) bool {
	return value != "" && len(value) <= 160 && !strings.ContainsAny(value, "/\\")
}
func (a API) putAsset(w http.ResponseWriter, r *http.Request) {
	workspaceID, assetID := r.PathValue("id"), r.PathValue("assetId")
	if !validAssetID(assetID) {
		fail(w, asset.ErrInvalid)
		return
	}
	if _, err := a.service.Store.Get(r.Context(), workspaceID); err != nil {
		fail(w, err)
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.HasPrefix(mediaType, "image/") {
		fail(w, asset.ErrInvalid)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAssetBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			send(w, 413, map[string]string{"error": "Image exceeds the 8 MiB asset limit"})
			return
		}
		fail(w, err)
		return
	}
	if len(data) == 0 {
		fail(w, asset.ErrInvalid)
		return
	}
	_, err = a.assets.PutAsset(r.Context(), asset.Stored{ID: assetID, WorkspaceID: workspaceID, MimeType: mediaType, Data: data})
	if err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (a API) getAsset(w http.ResponseWriter, r *http.Request) {
	value, err := a.assets.GetAsset(r.Context(), r.PathValue("id"), r.PathValue("assetId"))
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Content-Type", value.MimeType)
	w.Header().Set("Content-Length", strconv.Itoa(len(value.Data)))
	w.Header().Set("X-Notespace-Created-At", value.CreatedAt)
	w.Header().Set("Cache-Control", "private,max-age=31536000,immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(value.Data)
}
func (a API) deleteAsset(w http.ResponseWriter, r *http.Request) {
	if err := a.assets.DeleteAsset(r.Context(), r.PathValue("id"), r.PathValue("assetId")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a API) export(w http.ResponseWriter, r *http.Request) {
	p, err := a.service.Store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	assets, err := a.assets.ListAssets(r.Context(), p.ID)
	if err != nil {
		fail(w, err)
		return
	}
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	writeJSON := func(name string, value any) error {
		file, err := archive.Create(name)
		if err != nil {
			return err
		}
		return json.NewEncoder(file).Encode(value)
	}
	noteFiles := make([]map[string]any, 0, len(p.Notes))
	for index, note := range p.Notes {
		noteFiles = append(noteFiles, map[string]any{"id": note.ID, "title": note.Title, "file": fmt.Sprintf("notes/%04d.json", index+1)})
	}
	assetFiles := make([]map[string]any, 0, len(assets))
	for _, value := range assets {
		assetFiles = append(assetFiles, map[string]any{"id": value.ID, "mimeType": value.MimeType, "file": "assets/" + value.ID})
	}
	manifest := map[string]any{"format": "notespace-workspace", "version": 3, "workspace": map[string]any{"id": p.ID, "categoryId": p.CategoryID, "title": p.Title, "createdAt": p.CreatedAt, "updatedAt": p.UpdatedAt}, "notes": noteFiles, "canvas": "canvas/workspace.excalidraw.json", "assets": assetFiles}
	if err := writeJSON("manifest.json", manifest); err != nil {
		fail(w, err)
		return
	}
	if err := writeJSON("notes/notes.json", p.Notes); err != nil {
		fail(w, err)
		return
	}
	for index, note := range p.Notes {
		if err := writeJSON(fmt.Sprintf("notes/%04d.json", index+1), note); err != nil {
			fail(w, err)
			return
		}
	}
	if err := writeJSON("canvas/workspace.excalidraw.json", p.Canvas); err != nil {
		fail(w, err)
		return
	}
	var canvasData map[string]json.RawMessage
	if err := json.Unmarshal(p.Canvas.Data, &canvasData); err == nil {
		files := json.RawMessage(`{}`)
		if persisted, ok := canvasData["files"]; ok && len(persisted) > 0 {
			files = persisted
		}
		if err := writeJSON("canvas/files.json", files); err != nil {
			fail(w, err)
			return
		}
	}
	for _, value := range assets {
		file, err := archive.Create("assets/" + value.ID)
		if err != nil {
			fail(w, err)
			return
		}
		if _, err := file.Write(value.Data); err != nil {
			fail(w, err)
			return
		}
	}
	if err := archive.Close(); err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="notespace-workspace.zip"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buffer.Bytes())
}

func (a API) history(w http.ResponseWriter, r *http.Request) {
	if _, err := a.service.Store.Get(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	data, err := a.service.Store.ListHistory(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
func (a API) historySnapshot(w http.ResponseWriter, r *http.Request) {
	data, err := a.service.Store.GetHistory(r.Context(), r.PathValue("id"), r.PathValue("historyId"))
	if err != nil {
		fail(w, err)
		return
	}
	data.References = []project.Reference{}
	send(w, 200, data)
}
func (a API) restore(w http.ResponseWriter, r *http.Request) {
	current, err := a.service.Store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	snapshot, err := a.service.Store.GetHistory(r.Context(), r.PathValue("id"), r.PathValue("historyId"))
	if err != nil {
		fail(w, err)
		return
	}
	restored, err := a.service.Update(r.Context(), current.ID, project.Update{Title: snapshot.Title, Document: snapshot.Document, Notes: snapshot.Notes, Canvas: snapshot.Canvas, References: []project.Reference{}, SplitRatio: snapshot.SplitRatio, Version: current.Version})
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, restored)
}
func (a API) delete(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(r.PathValue("id")) == "" {
		fail(w, project.ErrInvalid)
		return
	}
	if err := a.service.Store.Delete(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	send(w, 204, nil)
}

func (a API) studyHeartbeat(w http.ResponseWriter, r *http.Request) {
	var body study.Heartbeat
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	session, err := a.study.Record(r.Context(), p.ID, p.Title, r.PathValue("sessionId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, session)
}
func (a API) workspaceStudy(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format(study.DateLayout)
	}
	if _, err := a.service.Store.Get(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	stats, err := a.study.GetWorkspaceStats(r.Context(), r.PathValue("id"), date)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, stats)
}
func (a API) activity(w http.ResponseWriter, r *http.Request) {
	data, err := a.study.GetActivity(r.Context(), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
func (a API) dayDetail(w http.ResponseWriter, r *http.Request) {
	data, err := a.study.GetDayDetail(r.Context(), r.PathValue("date"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
