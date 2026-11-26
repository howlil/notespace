package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateTagNameAndNormalizeKey(t *testing.T) {
	name, key, err := ValidateTagName("  Architecture & Design  ")
	if err != nil {
		t.Fatalf("ValidateTagName failed: %v", err)
	}
	if name != "Architecture & Design" || key != "architecture & design" {
		t.Fatalf("got (%q, %q)", name, key)
	}

	if _, _, err := ValidateTagName("   "); !errors.Is(err, ErrTagInvalid) {
		t.Fatalf("blank tag err = %v, want ErrTagInvalid", err)
	}
	if _, _, err := ValidateTagName("line1\nline2"); !errors.Is(err, ErrTagInvalid) {
		t.Fatalf("control char err = %v, want ErrTagInvalid", err)
	}
	if _, _, err := ValidateTagName(strings.Repeat("a", MaxTagNameRunes+1)); !errors.Is(err, ErrTagInvalid) {
		t.Fatalf("long tag err = %v, want ErrTagInvalid", err)
	}
}
