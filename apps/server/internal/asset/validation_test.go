package asset

import (
	"errors"
	"testing"
)

func TestNormalizeMimeTypeAcceptsCanonicalImageMediaTypes(t *testing.T) {
	tests := map[string]string{
		"image/png":                  "image/png",
		" image/jpeg ":               "image/jpeg",
		"image/svg+xml":              "image/svg+xml",
		"image/png; charset=utf-8":   "image/png",
	}
	for input, want := range tests {
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
	for _, input := range []string{"", "text/html", "application/json", "not a mime"} {
		if _, err := NormalizeMimeType(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("NormalizeMimeType(%q) error = %v, want ErrInvalid", input, err)
		}
	}
}

func TestNormalizeStoredCanonicalizesAssetIdentityAndMime(t *testing.T) {
	value := Stored{
		ID:          " asset-1 ",
		WorkspaceID: " workspace-1 ",
		MimeType:    " image/png; charset=utf-8 ",
		Data:        []byte("image"),
	}
	got, err := NormalizeStored(value)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "asset-1" || got.WorkspaceID != "workspace-1" || got.MimeType != "image/png" {
		t.Fatalf("normalized asset = %#v", got)
	}
	if string(got.Data) != "image" {
		t.Fatal("NormalizeStored changed asset bytes")
	}
}

func TestNormalizeStoredRejectsInvalidAssetShape(t *testing.T) {
	tests := []Stored{
		{WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("x")},
		{ID: "asset-1", MimeType: "image/png", Data: []byte("x")},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/png"},
		{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "text/html", Data: []byte("x")},
	}
	for _, value := range tests {
		if _, err := NormalizeStored(value); !errors.Is(err, ErrInvalid) {
			t.Fatalf("NormalizeStored(%#v) error = %v, want ErrInvalid", value, err)
		}
	}
}
