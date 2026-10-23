package sqlite

import (
	"context"
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
