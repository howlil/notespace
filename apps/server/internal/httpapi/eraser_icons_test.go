package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEraserIconGatewayFetchesValidatesAndCachesSVG(t *testing.T) {
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/aws-lambda.svg" {
			t.Fatalf("upstream path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "image/svg+xml")
		_, _ = io.WriteString(w, `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`)
	}))
	defer upstream.Close()

	gateway := newEraserIconGateway(upstream.Client(), upstream.URL)
	request := httptest.NewRequest(http.MethodGet, "/api/icons/eraser/aws-lambda", nil)
	request.SetPathValue("slug", "aws-lambda")
	response := httptest.NewRecorder()
	gateway.serve(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "image/svg+xml" {
		t.Fatalf("first response = %d %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "<svg") {
		t.Fatalf("response is not SVG: %q", response.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/icons/eraser/aws-lambda", nil)
	request.SetPathValue("slug", "aws-lambda")
	response = httptest.NewRecorder()
	gateway.serve(response, request)
	if response.Code != http.StatusOK || requests != 1 {
		t.Fatalf("cached response = %d, upstream requests = %d", response.Code, requests)
	}
}

func TestEraserIconGatewayRejectsInvalidOrUnsafeSVG(t *testing.T) {
	if validEraserIconSlug("../secrets") || validEraserIconSlug("aws lambda") || validEraserIconSlug("aws?lambda") {
		t.Fatal("unsafe icon slug accepted")
	}
	unsafe := []string{
		`<svg><script>alert(1)</script></svg>`,
		`<svg><path onclick="alert(1)"/></svg>`,
		`<svg><image href="https://example.com/tracker.png"/></svg>`,
		`<svg><foreignObject><div>html</div></foreignObject></svg>`,
		`<!DOCTYPE svg><svg></svg>`,
		`<html></html>`,
	}
	for _, payload := range unsafe {
		if validSVG([]byte(payload)) {
			t.Fatalf("unsafe or non-SVG payload accepted: %q", payload)
		}
	}
	if !validSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><use href="#shape"/></svg>`)) {
		t.Fatal("safe local SVG reference rejected")
	}
}
