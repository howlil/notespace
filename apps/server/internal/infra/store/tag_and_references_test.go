package store

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/domain"
)

func placeTestNote(t *testing.T, s *Store, workspaceID, noteID, instanceID, elementID, text string, canvasVersion int) domain.CreateNoteInstanceResult {
	t.Helper()
	scene := json.RawMessage(`{"elements":[{"id":"` + elementID + `","x":40,"y":64,"width":320,"height":180,"customData":{"notespaceNote":{"noteId":"` + noteID + `","instanceId":"` + instanceID + `","compact":false}}}],"appState":{},"files":{}}`)
	res, err := s.CreateNoteInstance(context.Background(), workspaceID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "req-" + instanceID,
		ClientNoteID:          noteID,
		ClientInstanceID:      instanceID,
		ElementID:             elementID,
		ExpectedCanvasVersion: canvasVersion,
		Document:              mdDoc(text),
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: scene},
		X:                     40,
		Y:                     64,
		Width:                 320,
		Height:                180,
	})
	if err != nil {
		t.Fatalf("CreateNoteInstance(%s): %v", noteID, err)
	}
	return res
}

func TestTagsCRUDAndBatchFiltering(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "tags.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	ws, err := s.CreateWorkspace(ctx, "Board")
	if err != nil {
		t.Fatal(err)
	}
	n1 := placeTestNote(t, s, ws.ID, "note-1", "inst-1", "el-1", "# Note One", ws.CanvasVersion)
	n2 := placeTestNote(t, s, ws.ID, "note-2", "inst-2", "el-2", "# Note Two", n1.Canvas.Version)

	t1, err := s.CreateTag(ctx, "Design")
	if err != nil {
		t.Fatal(err)
	}
	t1Dup, err := s.CreateTag(ctx, "  design ")
	if err != nil {
		t.Fatal(err)
	}
	if t1Dup.ID != t1.ID {
		t.Fatalf("idempotent CreateTag returned %q, want %q", t1Dup.ID, t1.ID)
	}
	t2, err := s.CreateTag(ctx, "Backend")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := s.RenameTag(ctx, t2.ID, "design"); !errors.Is(err, domain.ErrTagConflict) {
		t.Fatalf("RenameTag conflict = %v, want ErrTagConflict", err)
	}
	renamed, err := s.RenameTag(ctx, t2.ID, "Server")
	if err != nil || renamed.Name != "Server" || renamed.NormalizedKey != "server" {
		t.Fatalf("RenameTag = %+v, err=%v", renamed, err)
	}

	if err := s.BatchUpdateNoteTags(ctx, domain.BatchNoteTagsRequest{
		NoteIDs:   []string{n1.Note.ID, n2.Note.ID, n1.Note.ID},
		AddTagIDs: []string{t1.ID},
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.AssignNoteTag(ctx, n2.Note.ID, t2.ID); err != nil {
		t.Fatal(err)
	}

	bothTags, err := s.ListNotes(ctx, domain.NoteListQuery{TagIDs: []string{t1.ID, t2.ID}})
	if err != nil {
		t.Fatal(err)
	}
	if bothTags.Total != 1 || bothTags.Notes[0].ID != n2.Note.ID || len(bothTags.Notes[0].Tags) != 2 {
		t.Fatalf("AND tag filter = %+v", bothTags)
	}

	if err := s.RemoveNoteTag(ctx, n2.Note.ID, t1.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteTag(ctx, t2.ID); err != nil {
		t.Fatal(err)
	}

	// Notes must survive tag deletion.
	afterDelete, err := s.GetNote(ctx, n2.Note.ID)
	if err != nil || afterDelete.ID != n2.Note.ID {
		t.Fatalf("GetNote after tag delete = %+v, err=%v", afterDelete, err)
	}
}

func TestNoteReferencesBacklinksOutgoingAndRelatedRanking(t *testing.T) {
	ctx := context.Background()
	s, err := Open(ctx, filepath.Join(t.TempDir(), "refs.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	root, err := s.CreateWorkspace(ctx, "Root Board")
	if err != nil {
		t.Fatal(err)
	}
	sub, err := s.CreateWorkspace(ctx, "Sub Board", &root.ID)
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateWorkspace(ctx, "Other Board")
	if err != nil {
		t.Fatal(err)
	}

	// Selected note on root, references missing-note and note-backlink.
	sel := placeTestNote(t, s, root.ID, "note-selected", "inst-sel", "el-sel",
		"# Selected\n\nLinks [back](/workspaces/"+other.ID+"?noteId=note-backlink) and [missing](/workspaces/"+other.ID+"?noteId=missing-note).",
		root.CanvasVersion)
	// Note on root (Tier 2: On this workspace)
	onBoard := placeTestNote(t, s, root.ID, "note-on-board", "inst-board", "el-board",
		"# On Board\n\nTouches [linked](/workspaces/"+other.ID+"?noteId=note-linked-board).",
		sel.Canvas.Version)
	// Note on other referencing selected (Tier 1: References selected)
	refSel := placeTestNote(t, s, other.ID, "note-ref-sel", "inst-refsel", "el-refsel",
		"# Ref Selected\n\nSee [sel](/workspaces/"+root.ID+"?noteId=note-selected) for context.",
		other.CanvasVersion)
	// Note on other referenced by selected (Tier 1: Backlink)
	backlinkNote := placeTestNote(t, s, other.ID, "note-backlink", "inst-back", "el-back",
		"# Backlink Target",
		refSel.Canvas.Version)
	// Note on other linked from onBoard (Tier 3: Linked to board)
	linkedBoard := placeTestNote(t, s, other.ID, "note-linked-board", "inst-lb", "el-lb",
		"# Linked To Board",
		backlinkNote.Canvas.Version)
	// Note on sub (Tier 4: Subtopic)
	subNote := placeTestNote(t, s, sub.ID, "note-subtopic", "inst-sub", "el-sub",
		"# Subtopic Note",
		sub.CanvasVersion)
	// Note on other sharing tag with selected (Tier 5: Shared tag)
	sharedTagNote := placeTestNote(t, s, other.ID, "note-shared-tag", "inst-st", "el-st",
		"# Shared Tag Note",
		linkedBoard.Canvas.Version)
	// Unrelated note on other
	_ = placeTestNote(t, s, other.ID, "note-unrelated", "inst-unrel", "el-unrel",
		"# Unrelated",
		sharedTagNote.Canvas.Version)

	tag, err := s.CreateTag(ctx, "Topic")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.BatchUpdateNoteTags(ctx, domain.BatchNoteTagsRequest{
		NoteIDs:   []string{sel.Note.ID, sharedTagNote.Note.ID},
		AddTagIDs: []string{tag.ID},
	}); err != nil {
		t.Fatal(err)
	}

	info, err := s.GetNoteInfo(ctx, sel.Note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(info.Tags) != 1 || info.Tags[0].ID != tag.ID {
		t.Fatalf("GetNoteInfo tags = %+v", info.Tags)
	}
	if len(info.Backlinks) != 1 || info.Backlinks[0].NoteID != refSel.Note.ID || info.Backlinks[0].Excerpt == "" {
		t.Fatalf("GetNoteInfo backlinks = %+v", info.Backlinks)
	}
	if len(info.Outgoing) != 2 {
		t.Fatalf("GetNoteInfo outgoing = %+v, want 2", info.Outgoing)
	}
	if info.Outgoing[0].NoteID != "note-backlink" || info.Outgoing[0].Unresolved || info.Outgoing[0].Label != "Backlink Target" {
		t.Fatalf("outgoing[0] = %+v", info.Outgoing[0])
	}
	if info.Outgoing[1].NoteID != "missing-note" || !info.Outgoing[1].Unresolved {
		t.Fatalf("outgoing[1] = %+v", info.Outgoing[1])
	}

	related, err := s.ListNotes(ctx, domain.NoteListQuery{
		Scope:          "related",
		WorkspaceID:    root.ID,
		SelectedNoteID: sel.Note.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	gotOrder := make([]string, 0, len(related.Notes))
	gotReasons := make(map[string]string, len(related.Notes))
	for _, n := range related.Notes {
		gotOrder = append(gotOrder, n.ID)
		gotReasons[n.ID] = n.RelatedReason
	}
	// Tier 1 (ref-sel, backlink) -> Tier 2 (on-board) -> Tier 3 (linked-board) -> Tier 4 (subtopic) -> Tier 5 (shared-tag)
	if len(gotOrder) != 6 {
		t.Fatalf("related count = %d (%v), want 6", len(gotOrder), gotOrder)
	}
	if gotReasons[refSel.Note.ID] != "References selected" ||
		gotReasons[backlinkNote.Note.ID] != "Backlink" ||
		gotReasons[onBoard.Note.ID] != "On this workspace" ||
		gotReasons[linkedBoard.Note.ID] != "Linked to board" ||
		gotReasons[subNote.Note.ID] != "Subtopic" ||
		gotReasons[sharedTagNote.Note.ID] != "Shared tag" {
		t.Fatalf("related reasons = %+v", gotReasons)
	}
	// Verify tier ordering: Tier 1s before Tier 2 before Tier 3 before Tier 4 before Tier 5.
	pos := map[string]int{}
	for i, id := range gotOrder {
		pos[id] = i
	}
	if pos[onBoard.Note.ID] < 2 || pos[linkedBoard.Note.ID] <= pos[onBoard.Note.ID] ||
		pos[subNote.Note.ID] <= pos[linkedBoard.Note.ID] || pos[sharedTagNote.Note.ID] <= pos[subNote.Note.ID] {
		t.Fatalf("unexpected tier order: %v", gotOrder)
	}

	// Backup roundtrip preserves tags, note_tags, and rebuilds note_references.
	archiveBytes, err := s.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	s2, err := Open(ctx, filepath.Join(t.TempDir(), "restored.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if err := s2.RestoreBackupArchive(ctx, archiveBytes); err != nil {
		t.Fatal(err)
	}
	restoredInfo, err := s2.GetNoteInfo(ctx, sel.Note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(restoredInfo.Tags) != 1 || len(restoredInfo.Backlinks) != 1 || len(restoredInfo.Outgoing) != 2 {
		t.Fatalf("restored GetNoteInfo = %+v", restoredInfo)
	}
}
