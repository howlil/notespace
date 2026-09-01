package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/project"
)

type API struct {
	service project.Service
	health  func(context.Context) error
}

func New(store project.Store, health func(context.Context) error) http.Handler {
	a := API{service: project.Service{Store: store}, health: health}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := a.health(r.Context()); err != nil {
			fail(w, err)
			return
		}
		send(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/projects", a.list)
	mux.HandleFunc("POST /api/projects", a.create)
	mux.HandleFunc("GET /api/projects/{id}", a.get)
	mux.HandleFunc("PATCH /api/projects/{id}", a.update)
	mux.HandleFunc("DELETE /api/projects/{id}", a.delete)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { send(w, 404, map[string]string{"error": "Not found"}) })
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		// This unauthenticated private instance only accepts mutations from its own origin.
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
			send(w, 413, map[string]string{"error": "Project exceeds the 10 MiB limit"})
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
		send(w, 404, map[string]string{"error": "Project not found"})
	case errors.Is(err, project.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid title, content, version, or split ratio"})
	case errors.Is(err, project.ErrConflict):
		send(w, 409, map[string]string{"error": "This project changed in another tab. Your edits remain here; reload only after preserving them."})
	default:
		slog.Error("project operation failed", "error", err)
		send(w, 500, map[string]string{"error": "Unable to access project storage. Please retry."})
	}
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	data, err := a.service.Store.List(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
func (a API) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Create(r.Context(), body.Title)
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
