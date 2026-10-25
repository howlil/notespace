package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/capture"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestConcurrentCaptureConversionCreatesOneTarget(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "capture-concurrency.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "One owner")
	if err != nil {
		t.Fatal(err)
	}
	item, err := store.CreateCapture(ctx, "One target for simultaneous requests")
	if err != nil {
		t.Fatal(err)
	}
	request := capture.Organize{Version: item.Version, WorkspaceID: workspace.ID, Kind: "task"}

	start := make(chan struct{})
	results := make(chan capture.Item, 2)
	failures := make(chan error, 2)
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			value, err := store.OrganizeCapture(ctx, item.ID, request)
			if err != nil {
				failures <- err
				return
			}
			results <- value
		}()
	}
	close(start)
	workers.Wait()
	close(failures)
	close(results)

	for err := range failures {
		t.Errorf("same-request retry failed: %v", err)
	}
	var targetID string
	for result := range results {
		if result.TargetID == "" {
			t.Fatal("empty conversion target ID")
		}
		if targetID != "" && targetID != result.TargetID {
			t.Fatalf("duplicate targets: %s and %s", targetID, result.TargetID)
		}
		targetID = result.TargetID
	}
	if targetID == "" {
		t.Fatal("no conversion completed")
	}
	plan, err := store.GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Tasks) != 1 || plan.Tasks[0].ID != targetID {
		t.Fatalf("conversion created duplicate tasks: %+v", plan.Tasks)
	}
}

func TestConcurrentCaptureToNoteRetriesReuseOneTarget(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "capture-concurrent-notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	destination, err := workspacepkg.NewService(store).Create(ctx, "Shared Note Destination")
	if err != nil {
		t.Fatal(err)
	}
	item, err := store.CreateCapture(ctx, "First line\nSecond line")
	if err != nil {
		t.Fatal(err)
	}
	request := capture.Organize{Version: item.Version, WorkspaceID: destination.ID, Kind: "note"}
	begin := make(chan struct{})
	results := make(chan struct {
		item capture.Item
		err  error
	}, 2)
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-begin
			got, err := store.OrganizeCapture(ctx, item.ID, request)
			results <- struct {
				item capture.Item
				err  error
			}{got, err}
		}()
	}
	close(begin)
	workers.Wait()
	close(results)

	var targetID string
	for result := range results {
		if result.err != nil {
			t.Fatalf("identical concurrent Note conversion failed: %v", result.err)
		}
		if result.item.TargetKind != "note" || result.item.Status != "converted" || result.item.TargetID == "" {
			t.Fatalf("invalid Note receipt: %+v", result.item)
		}
		if targetID != "" && targetID != result.item.TargetID {
			t.Fatalf("duplicate Notes created: %q and %q", targetID, result.item.TargetID)
		}
		targetID = result.item.TargetID
	}
	notes, err := store.ListNotes(ctx, destination.ID)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, note := range notes {
		if note.ID == targetID {
			count++
		}
	}
	if targetID == "" || count != 1 {
		t.Fatalf("converted Note was not persisted exactly once: id=%q count=%d notes=%+v", targetID, count, notes)
	}
}

func TestConcurrentCaptureConversionWithDifferentDestinationsCommitsOneWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "capture-conflicting-destinations.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	first, err := workspacepkg.NewService(store).Create(ctx, "First Capture Destination")
	if err != nil {
		t.Fatal(err)
	}
	second, err := workspacepkg.NewService(store).Create(ctx, "Second Capture Destination")
	if err != nil {
		t.Fatal(err)
	}
	item, err := store.CreateCapture(ctx, "One note, one destination only")
	if err != nil {
		t.Fatal(err)
	}
	type outcome struct {
		item capture.Item
		err  error
	}
	results := make(chan outcome, 2)
	begin := make(chan struct{})
	var workers sync.WaitGroup
	for _, destination := range []string{first.ID, second.ID} {
		workers.Add(1)
		go func(workspaceID string) {
			defer workers.Done()
			<-begin
			got, err := store.OrganizeCapture(ctx, item.ID, capture.Organize{
				Version: item.Version, WorkspaceID: workspaceID, Kind: "note",
			})
			results <- outcome{got, err}
		}(destination)
	}
	close(begin)
	workers.Wait()
	close(results)

	var winner capture.Item
	successes, conflicts := 0, 0
	for got := range results {
		if got.err == nil {
			winner = got.item
			successes++
		} else if errors.Is(got.err, capture.ErrConflict) {
			conflicts++
		} else {
			t.Fatalf("unexpected conversion failure: %v", got.err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("conversion committed wrong number of owners: successes=%d conflicts=%d", successes, conflicts)
	}
	for _, owner := range []string{first.ID, second.ID} {
		notes, err := store.ListNotes(ctx, owner)
		if err != nil {
			t.Fatal(err)
		}
		found := 0
		for _, note := range notes {
			if note.ID == winner.TargetID {
				found++
			}
		}
		if owner == winner.TargetWorkspaceID && found != 1 {
			t.Fatalf("winner Note missing or duplicated: owner=%q notes=%+v", owner, notes)
		}
		if owner != winner.TargetWorkspaceID && found != 0 {
			t.Fatalf("losing Workspace contains converted Note: owner=%q notes=%+v", owner, notes)
		}
	}
}
