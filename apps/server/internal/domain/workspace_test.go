package domain

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestValidTitleUsesRuneCount(t *testing.T) {
	if !ValidTitle(strings.Repeat("🙂", 160)) {
		t.Fatal("160 runes should be valid")
	}
	if ValidTitle(strings.Repeat("🙂", 161)) {
		t.Fatal("161 runes should be invalid")
	}
	if ValidTitle("   ") {
		t.Fatal("blank title should be invalid")
	}
}

func TestValidateWorkspaceOwnsAggregateInvariants(t *testing.T) {
	now := "2026-11-25T00:00:00Z"
	valid := func() Workspace {
		return Workspace{
			WorkspaceSummary: WorkspaceSummary{
				ID:        "ws-1",
				ParentID:  nil,
				Title:     "Valid Workspace",
				CreatedAt: now,
				UpdatedAt: now,
				Version:   1,
			},
			Canvas: CanvasSnapshot{
				Format:  "excalidraw",
				Version: 1,
				Data:    json.RawMessage(`{"elements":[],"appState":{},"files":{}}`),
			},
			CanvasVersion: 1,
		}
	}
	self := "ws-1"
	slash := "bad/parent"
	tests := []struct {
		name   string
		mutate func(*Workspace)
	}{
		{"missing id", func(w *Workspace) { w.ID = "" }},
		{"self parent", func(w *Workspace) { w.ParentID = &self }},
		{"invalid parent id", func(w *Workspace) { w.ParentID = &slash }},
		{"blank title", func(w *Workspace) { w.Title = "   " }},
		{"title over limit", func(w *Workspace) { w.Title = strings.Repeat("x", 161) }},
		{"zero version", func(w *Workspace) { w.Version = 0 }},
		{"invalid canvas format", func(w *Workspace) { w.Canvas.Format = "svg" }},
		{"invalid canvas shape", func(w *Workspace) { w.Canvas.Data = []byte(`{"elements":[],"appState":{}}`) }},
		{"non-object element", func(w *Workspace) { w.Canvas.Data = []byte(`{"elements":[123],"appState":{},"files":{}}`) }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			value := valid()
			tc.mutate(&value)
			if err := ValidateWorkspace(value); !errors.Is(err, ErrWorkspaceInvalid) {
				t.Fatalf("ValidateWorkspace() error = %v, want ErrWorkspaceInvalid", err)
			}
		})
	}
}

func TestNormalizeWorkspaceQueryRejectsInvalidSortAndBounds(t *testing.T) {
	got, err := NormalizeWorkspaceQuery(WorkspaceQuery{Sort: "name"})
	if err != nil || got.Limit != DefaultWorkspaceLimit || got.Sort != "name" {
		t.Fatalf("NormalizeWorkspaceQuery(name) = (%+v, %v)", got, err)
	}
	for _, bad := range []WorkspaceQuery{
		{RootOnly: true, ParentID: "ws-1"},
		{Sort: "invalid"},
		{Offset: -1},
		{Limit: -5},
		{Limit: MaxWorkspaceLimit + 1},
		{Snapshot: WorkspaceSnapshotStart, Offset: 1},
	} {
		if _, err := NormalizeWorkspaceQuery(bad); !errors.Is(err, ErrWorkspaceInvalid) {
			t.Fatalf("NormalizeWorkspaceQuery(%+v) error = %v, want ErrWorkspaceInvalid", bad, err)
		}
	}
}
