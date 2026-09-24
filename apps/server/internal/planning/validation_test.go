package planning

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateTaskOwnsTaskInvariants(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Task)
	}{
		{"missing id", func(task *Task) { task.ID = "" }},
		{"blank title", func(task *Task) { task.Title = "   " }},
		{"title over limit", func(task *Task) { task.Title = strings.Repeat("x", 161) }},
		{"description over limit", func(task *Task) { task.Description = strings.Repeat("x", 4001) }},
		{"negative position", func(task *Task) { task.Position = -1 }},
		{"zero version", func(task *Task) { task.Version = 0 }},
		{"milestone without workspace", func(task *Task) { task.WorkspaceID = nil }},
		{"invalid planned date", func(task *Task) { task.PlannedFor = stringPointer("2026-02-30") }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			task := validTaskFixture()
			tc.mutate(&task)
			if err := ValidateTask(task); !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
		})
	}
}

func TestValidateStandaloneTaskRejectsWorkspaceOwnership(t *testing.T) {
	task := validTaskFixture()
	task.MilestoneID = nil
	if err := ValidateStandaloneTask(task); !errors.Is(err, ErrInvalid) {
		t.Fatalf("error = %v", err)
	}
	task.WorkspaceID = nil
	if err := ValidateStandaloneTask(task); err != nil {
		t.Fatalf("valid standalone task rejected: %v", err)
	}
}

func TestValidatePlanOwnsRelationshipInvariants(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Plan)
	}{
		{"plan workspace mismatch", func(plan *Plan) { plan.WorkspaceID = "other" }},
		{"duplicate milestone", func(plan *Plan) { plan.Milestones = append(plan.Milestones, plan.Milestones[0]) }},
		{"duplicate task", func(plan *Plan) { plan.Tasks = append(plan.Tasks, plan.Tasks[0]) }},
		{"task workspace mismatch", func(plan *Plan) { plan.Tasks[0].WorkspaceID = stringPointer("other") }},
		{"unknown milestone", func(plan *Plan) { plan.Tasks[0].MilestoneID = stringPointer("missing") }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			plan := validPlanFixture()
			tc.mutate(&plan)
			if err := ValidatePlan(plan, "workspace-1"); !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
		})
	}
}

func TestPlanningDateValidationUsesCanonicalDateKeys(t *testing.T) {
	for _, value := range []string{"2026-09-24", "2024-02-29"} {
		if !validDateKey(value) {
			t.Fatalf("valid date %q rejected", value)
		}
	}
	for _, value := range []string{"", "2026-9-24", "2026-02-30", "24-09-2026"} {
		if validDateKey(value) {
			t.Fatalf("invalid date %q accepted", value)
		}
	}
}
