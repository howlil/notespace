package planning

import (
	"context"
	"errors"
	"testing"
)

func TestTodayValidatesDateAtPlanningBoundary(t *testing.T) {
	store := &planningTestStore{}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, nil)
	if _, err := service.Today(context.Background(), "2026-02-30"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("error = %v", err)
	}
	if store.listTodayCalls != 0 {
		t.Fatalf("ListToday calls = %d", store.listTodayCalls)
	}
}

func TestTodayAndInboxWrapStoreProjection(t *testing.T) {
	todayTask := TodayTask{Task: Task{ID: "task-1", Title: "Today", Version: 1}}
	inboxTask := Task{ID: "task-2", Title: "Inbox", Version: 1}
	store := &planningTestStore{today: []TodayTask{todayTask}, inbox: []Task{inboxTask}}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, nil)
	today, err := service.Today(context.Background(), "2026-09-24")
	if err != nil {
		t.Fatal(err)
	}
	if today.Date != "2026-09-24" || len(today.Tasks) != 1 || today.Tasks[0].ID != todayTask.ID {
		t.Fatalf("today = %#v", today)
	}
	inbox, err := service.Inbox(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(inbox.Tasks) != 1 || inbox.Tasks[0].ID != inboxTask.ID {
		t.Fatalf("inbox = %#v", inbox)
	}
}
