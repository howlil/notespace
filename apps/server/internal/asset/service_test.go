package asset

import (
	"context"
	"errors"
	"testing"
)

type assetTestStore struct{ putInput Stored }

func (s *assetTestStore) PutAsset(_ context.Context, value Stored) (Stored, error) {
	s.putInput = value
	return value, nil
}
func (s *assetTestStore) GetAsset(context.Context, string, string) (Stored, error) {
	return Stored{}, nil
}
func (s *assetTestStore) DeleteAsset(context.Context, string, string) error { return nil }

type assetWorkspaceLookup struct {
	exists bool
	err    error
	seenID string
}

func (s *assetWorkspaceLookup) WorkspaceExists(_ context.Context, id string) (bool, error) {
	s.seenID = id
	return s.exists, s.err
}

func TestPutValidatesBeforeDependencies(t *testing.T) {
	tests := []struct {
		name  string
		value Stored
	}{
		{"missing id", Stored{WorkspaceID: "workspace-1", MimeType: "image/png", Data: []byte("x")}},
		{"missing workspace", Stored{ID: "asset-1", MimeType: "image/png", Data: []byte("x")}},
		{"missing mime", Stored{ID: "asset-1", WorkspaceID: "workspace-1", Data: []byte("x")}},
		{"empty data", Stored{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "image/png"}},
		{"non-image mime", Stored{ID: "asset-1", WorkspaceID: "workspace-1", MimeType: "text/html", Data: []byte("x")}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store, lookup := &assetTestStore{}, &assetWorkspaceLookup{exists: true}
			if _, err := NewService(store, lookup).Put(context.Background(), tc.value); !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v", err)
			}
			if lookup.seenID != "" || store.putInput.ID != "" {
				t.Fatal("invalid input reached dependency")
			}
		})
	}
}

func TestPutRequiresExistingWorkspaceAndNormalizesValue(t *testing.T) {
	value := Stored{ID: " asset-1 ", WorkspaceID: " workspace-1 ", MimeType: " image/png ", Data: []byte("x")}
	if _, err := NewService(&assetTestStore{}, &assetWorkspaceLookup{exists: false}).Put(context.Background(), value); !errors.Is(err, ErrWorkspaceNotFound) {
		t.Fatalf("error = %v", err)
	}
	want := errors.New("lookup failed")
	if _, err := NewService(&assetTestStore{}, &assetWorkspaceLookup{err: want}).Put(context.Background(), value); !errors.Is(err, want) {
		t.Fatalf("error = %v", err)
	}
	store, lookup := &assetTestStore{}, &assetWorkspaceLookup{exists: true}
	got, err := NewService(store, lookup).Put(context.Background(), value)
	if err != nil {
		t.Fatal(err)
	}
	if lookup.seenID != "workspace-1" || store.putInput.ID != "asset-1" || store.putInput.WorkspaceID != "workspace-1" || store.putInput.MimeType != "image/png" {
		t.Fatalf("normalized input = %#v lookup=%q", store.putInput, lookup.seenID)
	}
	if got.ID != "asset-1" {
		t.Fatalf("result = %#v", got)
	}
}

func TestGetAndDeleteRejectBlankIdentifiers(t *testing.T) {
	service := NewService(&assetTestStore{}, &assetWorkspaceLookup{exists: true})
	if _, err := service.Get(context.Background(), " ", "asset-1"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("Get error = %v", err)
	}
	if err := service.Delete(context.Background(), "workspace-1", " "); !errors.Is(err, ErrInvalid) {
		t.Fatalf("Delete error = %v", err)
	}
}
