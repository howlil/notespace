package httpapi

import (
	"net/http"
	"strconv"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func parseIntQuery(r *http.Request, key string, fallback int) (int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, workspace.ErrInvalid
	}
	return value, nil
}

func parseBoolQuery(r *http.Request, key string) (bool, error) {
	switch r.URL.Query().Get(key) {
	case "", "false", "0":
		return false, nil
	case "true", "1":
		return true, nil
	default:
		return false, workspace.ErrInvalid
	}
}

func workspaceQuery(r *http.Request, categoryID string) (workspace.WorkspaceQuery, error) {
	hasCanvas, err := parseBoolQuery(r, "hasCanvas")
	if err != nil {
		return workspace.WorkspaceQuery{}, err
	}
	hasNotes, err := parseBoolQuery(r, "hasNotes")
	if err != nil {
		return workspace.WorkspaceQuery{}, err
	}
	offset, err := parseIntQuery(r, "offset", 0)
	if err != nil || offset < 0 {
		return workspace.WorkspaceQuery{}, workspace.ErrInvalid
	}
	limit, err := parseIntQuery(r, "limit", 50)
	if err != nil || limit < 1 || limit > 100 {
		return workspace.WorkspaceQuery{}, workspace.ErrInvalid
	}
	sortBy := r.URL.Query().Get("sort")
	switch sortBy {
	case "", "created", "name", "notes":
	default:
		return workspace.WorkspaceQuery{}, workspace.ErrInvalid
	}
	return workspace.WorkspaceQuery{
		CategoryID: categoryID,
		Query:      r.URL.Query().Get("q"),
		Sort:       sortBy,
		HasCanvas:  hasCanvas,
		HasNotes:   hasNotes,
		Offset:     offset,
		Limit:      limit,
	}, nil
}

