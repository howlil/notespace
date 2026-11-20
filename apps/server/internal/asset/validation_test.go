package asset

import (
	"errors"
	"testing"
)

func TestNormalizeMimeTypeAcceptsCanonicalImageMediaTypes(t *testing.T) {
	for input, want := range map[string]string{
		"image/png":  "image/png",
		"image/jpeg": "image/jpeg",
		"image/webp": "image/webp",
		"image/gif":  "image/gif",
		"image/avif": "image/avif",
	} {
		got, err := NormalizeMimeType(input)
		if err != nil {
			t.Fatalf("NormalizeMimeType(%q): %v", input, err)
		}
		if got != want {
			t.Fatalf("NormalizeMimeType(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeMimeTypeRejectsNonImageOrMalformedMediaTypes(t *testing.T) {
	for _, input := range []string{"", "text/html", "application/json", "image", "image/", " not a type ", "image/png; charset=utf-8; ;"} {
		if _, err := NormalizeMimeType(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("NormalizeMimeType(%q) error = %v, want ErrInvalid", input, err)
		}
	}
}

func TestNormalizeMimeTypeRejectsSVG(t *testing.T) {
	// SVG loaded as a document can run script in the same origin, so it must
	// never be accepted as a durable asset regardless of casing or parameters.
	for _, input := range []string{"image/svg+xml", "image/svg+xml; charset=utf-8", "IMAGE/SVG+XML", "image/svg"} {
		if _, err := NormalizeMimeType(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("NormalizeMimeType(%q) error = %v, want ErrInvalid", input, err)
		}
	}
}

func TestNormalizeStoredPreservesCanonicalMediaType(t *testing.T) {
	value, err := NormalizeStored(Stored{
		ID:          "asset-1",
		WorkspaceID: "workspace-1",
		MimeType:    " image/png; charset=utf-8 ",
		Data:        []byte("image-bytes"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := value.MimeType; got != "image/png" {
		t.Fatalf("NormalizeStored MimeType = %q, want image/png", got)
	}
}

func TestNormalizeStoredRejectsIncompleteOrUnsafeAssets(t *testing.T) {
	for _, value := range []Stored{
		{WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("x")},
		{ID: "asset-1", MimeType: "image/png", Data: []byte("x")},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/png"},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "text/html", Data: []byte("x")},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/svg+xml", Data: []byte("<svg/>")},
	} {
		if err := ValidateStored(value); !errors.Is(err, ErrInvalid) {
			t.Fatalf("ValidateStored(%#v) error = %v, want ErrInvalid", value, err)
		}
	}
}
