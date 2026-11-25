// Package eraser proxies, validates, and caches external Eraser diagram SVG
// icons with singleflight deduplication and strict SVG sanitization.
package eraser

import (
	"context"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

const (
	DefaultOrigin      = "https://storage.googleapis.com/eraser-public-assets/canvas-icons/"
	maxEraserIconBytes = 1 << 20
)

var _ domain.IconSource = (*EraserSource)(nil)

func validEraserIconSlug(slug string) bool {
	if slug == "" || len(slug) > 200 {
		return false
	}
	for _, char := range slug {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') || strings.ContainsRune("-_.+&()", char) {
			continue
		}
		return false
	}
	return true
}

func (g *EraserSource) fetchUpstream(ctx context.Context, slug string) (domain.IconEntry, error) {
	requestURL := g.baseURL + url.PathEscape(slug) + ".svg"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return domain.IconEntry{}, err
	}
	response, err := g.client.Do(req)
	if err != nil {
		return domain.IconEntry{}, apperr.Wrap(domain.ErrIconUnavailable, err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode == http.StatusNotFound {
		return domain.IconEntry{}, domain.ErrIconNotFound
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return domain.IconEntry{}, domain.ErrIconUnavailable
	}
	mediaType, _, mediaErr := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if mediaErr != nil || mediaType != "image/svg+xml" {
		return domain.IconEntry{}, domain.ErrIconNotFound
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxEraserIconBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxEraserIconBytes || !validSVG(data) {
		return domain.IconEntry{}, domain.ErrIconNotFound
	}
	return domain.IconEntry{Data: data, ContentType: "image/svg+xml"}, nil
}
