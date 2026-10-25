package sqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// Each autosave commits its granular row and aggregate revision together.
// A Workspace snapshot must never combine an aggregate revision with granular
// Note/Canvas versions from a different commit boundary.
func TestWorkspaceSnapshotKeepsGranularRevisionsCoherentDuringAutosaves(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "concurrent-snapshot.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	created, err := service.Create(ctx, "Parallel authored revisions")
	if err != nil {
		t.Fatal(err)
	}
	const iterations = 12
	ready := make(chan struct{}, 2)
	begin := make(chan struct{})
	results := make(chan error, 2)

	go func() {
		ready <- struct{}{}
		<-begin
		version := created.Notes[0].Version
		for i := 0; i < iterations; i++ {
			note, err := service.UpdateNote(ctx, created.ID, created.Notes[0].ID, workspacepkg.NoteUpdate{
				Title: created.Notes[0].Title, Document: granularDocument(fmt.Sprintf("note-%d", i)), Version: version,
			})
			if err != nil {
				results <- fmt.Errorf("note autosave %d: %w", i, err)
				return
			}
			version = note.Version
		}
		results <- nil
	}()
	go func() {
		ready <- struct{}{}
		<-begin
		version := created.CanvasVersion
		for i := 0; i < iterations; i++ {
			canvas, err := service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{
				Canvas: granularCanvas(fmt.Sprintf("canvas-%d", i)), Version: version,
			})
			if err != nil {
				results <- fmt.Errorf("canvas autosave %d: %w", i, err)
				return
			}
			version = canvas.Version
		}
		results <- nil
	}()

	<-ready
	<-ready
	close(begin)
	for i := 0; i < 120; i++ {
		snapshot, err := service.Get(ctx, created.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(snapshot.Notes) != 1 {
			t.Fatalf("snapshot has %d notes", len(snapshot.Notes))
		}
		noteDelta := snapshot.Notes[0].Version - created.Notes[0].Version
		canvasDelta := snapshot.CanvasVersion - created.CanvasVersion
		if snapshot.Version != created.Version+noteDelta+canvasDelta {
			t.Fatalf("mixed snapshot: workspace=%d note=%d canvas=%d (baseline %d/%d/%d)",
				snapshot.Version, snapshot.Notes[0].Version, snapshot.CanvasVersion,
				created.Version, created.Notes[0].Version, created.CanvasVersion)
		}
	}
	for i := 0; i < 2; i++ {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	after, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Version != created.Version+2*iterations ||
		after.Notes[0].Version != created.Notes[0].Version+iterations ||
		after.CanvasVersion != created.CanvasVersion+iterations {
		t.Fatalf("lost one or more committed autosaves: %+v", after.Summary)
	}
}
