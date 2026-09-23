package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func expectedVersion(r *http.Request) (*int, error) {
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
		return nil, workspace.ErrInvalid
	}
	return &value, nil
}

