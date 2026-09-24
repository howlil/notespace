package planning

import "context"

type planningTestStore struct {
	plan                       Plan
	getPlanErr                 error
	task                       Task
	getTaskErr                 error
	today                      []TodayTask
	listTodayErr               error
	listTodayCalls             int
	inbox                      []Task
	listInboxErr               error
	createMilestoneInput       Milestone
	createMilestoneErr         error
	updateMilestoneInput       Milestone
	updateMilestoneErr         error
	deleteMilestoneWorkspaceID string
	deleteMilestoneID          string
	deleteMilestoneVersion     int
	deleteMilestoneErr         error
	createTaskInput            Task
	createTaskErr              error
	updateTaskInput            Task
	updateTaskErr              error
	deleteTaskID               string
	deleteTaskVersion          int
	deleteTaskErr              error
}

type planningWorkspaceLookup struct {
	exists bool
	err    error
	seenID string
}

func stringPointer(value string) *string { return &value }
func boolPointerTest(value bool) *bool   { return &value }

func validTaskFixture() Task {
	workspaceID, milestoneID := "workspace-1", "milestone-1"
	return Task{
		ID: "task-1", WorkspaceID: &workspaceID, MilestoneID: &milestoneID,
		Title: "Implement tests", Description: "Protect behavior", Position: 0,
		CreatedAt: "2026-09-24T08:00:00Z", UpdatedAt: "2026-09-24T08:00:00Z", Version: 2,
	}
}
func validMilestoneFixture() Milestone {
	return Milestone{ID: "milestone-1", WorkspaceID: "workspace-1", Title: "Ship MVP", Position: 0, CreatedAt: "2026-09-24T08:00:00Z", UpdatedAt: "2026-09-24T08:00:00Z", Version: 2}
}
func validPlanFixture() Plan {
	return Plan{WorkspaceID: "workspace-1", Milestones: []Milestone{validMilestoneFixture()}, Tasks: []Task{validTaskFixture()}}
}

func (s *planningTestStore) GetPlan(context.Context, string) (Plan, error) {
	return s.plan, s.getPlanErr
}
func (s *planningTestStore) GetTask(context.Context, string) (Task, error) {
	return s.task, s.getTaskErr
}
func (s *planningTestStore) ListToday(context.Context, string) ([]TodayTask, error) {
	s.listTodayCalls++
	return s.today, s.listTodayErr
}
func (s *planningTestStore) ListInbox(context.Context) ([]Task, error) {
	return s.inbox, s.listInboxErr
}
func (s *planningTestStore) CreateMilestone(_ context.Context, item Milestone) (Milestone, error) {
	s.createMilestoneInput = item
	if s.createMilestoneErr != nil {
		return Milestone{}, s.createMilestoneErr
	}
	return item, nil
}
func (s *planningTestStore) UpdateMilestone(_ context.Context, item Milestone) (Milestone, error) {
	s.updateMilestoneInput = item
	if s.updateMilestoneErr != nil {
		return Milestone{}, s.updateMilestoneErr
	}
	item.Version++
	return item, nil
}
func (s *planningTestStore) DeleteMilestone(_ context.Context, workspaceID, milestoneID string, version int) error {
	s.deleteMilestoneWorkspaceID, s.deleteMilestoneID, s.deleteMilestoneVersion = workspaceID, milestoneID, version
	return s.deleteMilestoneErr
}
func (s *planningTestStore) CreateTask(_ context.Context, item Task) (Task, error) {
	s.createTaskInput = item
	if s.createTaskErr != nil {
		return Task{}, s.createTaskErr
	}
	return item, nil
}
func (s *planningTestStore) UpdateTask(_ context.Context, item Task) (Task, error) {
	s.updateTaskInput = item
	if s.updateTaskErr != nil {
		return Task{}, s.updateTaskErr
	}
	item.Version++
	return item, nil
}
func (s *planningTestStore) DeleteTask(_ context.Context, id string, version int) error {
	s.deleteTaskID, s.deleteTaskVersion = id, version
	return s.deleteTaskErr
}
func (s *planningWorkspaceLookup) WorkspaceExists(_ context.Context, id string) (bool, error) {
	s.seenID = id
	return s.exists, s.err
}
