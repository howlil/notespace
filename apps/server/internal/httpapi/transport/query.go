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

func ParseWorkspaceQuery(r *http.Request) (domain.WorkspaceQuery, error) {
	rootOnly, err := parseBoolQuery(r, "rootOnly")
	if err != nil {
		return domain.WorkspaceQuery{}, domain.ErrWorkspaceInvalid
	}
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
		RootOnly:  rootOnly,
		ParentID:  r.URL.Query().Get("parentId"),
		Query:     r.URL.Query().Get("q"),
		Sort:      r.URL.Query().Get("sort"),
		HasCanvas: hasCanvas,
		Offset:    offset,
		Limit:     limit,
		Snapshot:  r.URL.Query().Get("snapshot"),
	})
}

func ParseNoteListQuery(r *http.Request) (domain.NoteListQuery, error) {
	unplaced, err := parseBoolQuery(r, "unplaced")
	if err != nil {
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	placed := strings.TrimSpace(r.URL.Query().Get("placed"))
	switch placed {
	case "", "all", "placed", "unplaced":
	default:
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	if unplaced {
		if placed == "placed" {
			return domain.NoteListQuery{}, domain.ErrNoteInvalid
		}
		placed = "unplaced"
	}
	workspaceID := strings.TrimSpace(r.URL.Query().Get("workspaceId"))
	if workspaceID != "" && !domain.ValidID(workspaceID, domain.MaxNoteIDLength) {
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	var tagIDs []string
	if rawTags := strings.TrimSpace(r.URL.Query().Get("tagIds")); rawTags != "" {
		seen := map[string]bool{}
		for _, part := range strings.Split(rawTags, ",") {
			id := strings.TrimSpace(part)
			if !domain.ValidID(id, domain.MaxIDLength) {
				return domain.NoteListQuery{}, domain.ErrNoteInvalid
			}
			if !seen[id] {
				seen[id] = true
				tagIDs = append(tagIDs, id)
			}
		}
	}
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	switch scope {
	case "", "all", "related":
	default:
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	selectedNoteID := strings.TrimSpace(r.URL.Query().Get("selectedNoteId"))
	if selectedNoteID != "" && !domain.ValidID(selectedNoteID, domain.MaxNoteIDLength) {
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	sortMode := strings.TrimSpace(r.URL.Query().Get("sort"))
	switch sortMode {
	case "", "updated", "created", "title":
	default:
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	offset, err := parseIntQuery(r, "offset", 0)
	if err != nil || offset < 0 {
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	limit, err := parseIntQuery(r, "limit", domain.DefaultNoteLimit)
	if err != nil || limit < 1 || limit > domain.MaxNoteLimit {
		return domain.NoteListQuery{}, domain.ErrNoteInvalid
	}
	return domain.NoteListQuery{
		Query:          strings.TrimSpace(r.URL.Query().Get("q")),
		Placed:         placed,
		Unplaced:       placed == "unplaced",
		WorkspaceID:    workspaceID,
		TagIDs:         tagIDs,
		Scope:          scope,
		SelectedNoteID: selectedNoteID,
		Sort:           sortMode,
		Offset:         offset,
		Limit:          limit,
	}, nil
}
