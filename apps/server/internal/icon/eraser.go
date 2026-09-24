package icon

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
)

const (
	DefaultEraserOrigin = "https://storage.googleapis.com/eraser-public-assets/canvas-icons/"
	maxEraserIconBytes  = 1 << 20
)

var (
	ErrInvalidName = errors.New("invalid Eraser icon name")
	ErrNotFound    = errors.New("Eraser icon not found")
)

type Entry struct {
	Data        []byte
	ContentType string
}

type Source interface {
	Fetch(context.Context, string) (Entry, error)
}

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

func (g *EraserSource) fetchUpstream(ctx context.Context, slug string) (Entry, error) {
	requestURL := g.baseURL + url.PathEscape(slug) + ".svg"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return Entry{}, err
	}
	response, err := g.client.Do(req)
	if err != nil {
		return Entry{}, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return Entry{}, ErrNotFound
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return Entry{}, errors.New("Eraser icon source unavailable")
	}
	mediaType, _, mediaErr := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if mediaErr != nil || mediaType != "image/svg+xml" {
		return Entry{}, ErrNotFound
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxEraserIconBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxEraserIconBytes || !validSVG(data) {
		return Entry{}, ErrNotFound
	}
	return Entry{Data: data, ContentType: "image/svg+xml"}, nil
}
