package transport

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

func ExpectedVersion(r *http.Request) (*int, error) {
	raw := strings.TrimSpace(r.Header.Get("If-Match"))
	if raw == "" {
		return nil, nil
	}
	if strings.HasPrefix(raw, "W/") {
		raw = strings.TrimSpace(strings.TrimPrefix(raw, "W/"))
	}
	raw = strings.Trim(raw, `"`)
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return nil, domain.ErrWorkspaceInvalid
	}
	return &value, nil
}

func parseIntQuery(r *http.Request, key string, fallback int) (int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, apperr.ErrInvalid
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
		return false, apperr.ErrInvalid
	}
}

func ParseWorkspaceQuery(r *http.Request, categoryID string) (domain.WorkspaceQuery, error) {
	hasCanvas, err := parseBoolQuery(r, "hasCanvas")
	if err != nil {
		return domain.WorkspaceQuery{}, domain.ErrWorkspaceInvalid
	}
	offset, err := parseIntQuery(r, "offset", 0)
	if err != nil {
		return domain.WorkspaceQuery{}, domain.ErrWorkspaceInvalid
	}
	limit, err := parseIntQuery(r, "limit", domain.DefaultWorkspaceLimit)
	if err != nil {
		return domain.WorkspaceQuery{}, domain.ErrWorkspaceInvalid
	}
	// Reject explicit limit=0 in HTTP query strings before defaulting.
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" && limit < 1 {
		return domain.WorkspaceQuery{}, domain.ErrWorkspaceInvalid
	}
	return domain.NormalizeWorkspaceQuery(domain.WorkspaceQuery{
		CategoryID: categoryID,
		Query:      r.URL.Query().Get("q"),
		Sort:       r.URL.Query().Get("sort"),
		HasCanvas:  hasCanvas,
		Offset:     offset,
		Limit:      limit,
		Snapshot:   r.URL.Query().Get("snapshot"),
	})
}

func ParseNoteListQuery(r *http.Request) (domain.NoteListQuery, error) {
	unplaced, err := parseBoolQuery(r, "unplaced")
	if err != nil {
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	limit, err := parseIntQuery(r, "limit", domain.DefaultNoteLimit)
	if err != nil || limit < 1 || limit > domain.MaxNoteLimit {
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	return domain.NoteListQuery{
		Query:    strings.TrimSpace(r.URL.Query().Get("q")),
		Unplaced: unplaced,
		Limit:    limit,
	}, nil
}
