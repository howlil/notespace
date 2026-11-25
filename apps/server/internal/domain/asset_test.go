package domain

import (
	"errors"
	"testing"
)

func TestNormalizeAssetMimeTypeAcceptsCanonicalImageMediaTypes(t *testing.T) {
	for input, want := range map[string]string{
		"image/png":  "image/png",
		"image/jpeg": "image/jpeg",
		"image/webp": "image/webp",
		"image/gif":  "image/gif",
		"image/avif": "image/avif",
	} {
		got, err := NormalizeAssetMimeType(input)
		if err != nil {
			t.Fatalf("NormalizeAssetMimeType(%q): %v", input, err)
		}
		if got != want {
			t.Fatalf("NormalizeAssetMimeType(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeAssetMimeTypeRejectsNonImageOrMalformedMediaTypes(t *testing.T) {
	for _, input := range []string{"", "text/html", "application/json", "image", "image/", " not a type ", "image/png; charset=utf-8; ;"} {
		if _, err := NormalizeAssetMimeType(input); !errors.Is(err, ErrAssetInvalid) {
			t.Fatalf("NormalizeAssetMimeType(%q) error = %v, want ErrAssetInvalid", input, err)
		}
	}
}

func TestNormalizeAssetMimeTypeRejectsSVG(t *testing.T) {
	for _, input := range []string{"image/svg+xml", "image/svg+xml; charset=utf-8", "IMAGE/SVG+XML", "image/svg", "image/xml", "image/html", "image/custom+xml"} {
		if _, err := NormalizeAssetMimeType(input); !errors.Is(err, ErrAssetInvalid) {
			t.Fatalf("NormalizeAssetMimeType(%q) error = %v, want ErrAssetInvalid", input, err)
		}
	}
}

func TestNormalizeStoredAssetPreservesCanonicalMediaType(t *testing.T) {
	value, err := NormalizeStoredAsset(StoredAsset{
		ID:          "asset-1",
		WorkspaceID: "workspace-1",
		MimeType:    " image/png; charset=utf-8 ",
		Data:        []byte("image-bytes"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := value.MimeType; got != "image/png" {
		t.Fatalf("NormalizeStoredAsset MimeType = %q, want image/png", got)
	}
}

func TestNormalizeStoredAssetRejectsIncompleteOrUnsafeAssets(t *testing.T) {
	for _, value := range []StoredAsset{
		{WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("x")},
		{ID: "asset-1", MimeType: "image/png", Data: []byte("x")},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/png"},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "text/html", Data: []byte("x")},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/svg+xml", Data: []byte("<svg/>")},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("<svg><script>alert(1)</script></svg>")},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("<!DOCTYPE html><html></html>")},
		{ID: "../escape", WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("x")},
		{ID: `a\b`, WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("x")},
	} {
		if _, err := NormalizeStoredAsset(value); !errors.Is(err, ErrAssetInvalid) {
			t.Fatalf("NormalizeStoredAsset(%#v) error = %v, want ErrAssetInvalid", value, err)
		}
	}
}
