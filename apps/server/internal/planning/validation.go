package planning

import (
	"strings"
	"time"
	"unicode/utf8"
)

func validTitle(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && utf8.RuneCountInString(value) <= 160
}

func validDescription(value string) bool {
	return utf8.RuneCountInString(value) <= 4000
}

func validDateKey(value string) bool {
	if len(value) != len("2006-01-02") {
		return false
	}
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func normalizePlannedFor(value string) (*string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if !validDateKey(value) {
		return nil, ErrInvalid
	}
	return &value, nil
}

func ValidateTask(task Task) error {
	if task.ID == "" || !validTitle(task.Title) || !validDescription(task.Description) || task.Position < 0 || task.Version < 1 {
		return ErrInvalid
	}
	if task.MilestoneID != nil && task.WorkspaceID == nil {
		return ErrInvalid
	}
	if task.PlannedFor != nil && !validDateKey(*task.PlannedFor) {
		return ErrInvalid
	}
	return nil
}

func ValidateStandaloneTask(task Task) error {
	if task.WorkspaceID != nil || task.MilestoneID != nil {
		return ErrInvalid
	}
	return ValidateTask(task)
}

func ValidatePlan(plan Plan, workspaceID string) error {
	if plan.WorkspaceID != "" && plan.WorkspaceID != workspaceID {
		return ErrInvalid
	}
	milestones := map[string]bool{}
	for _, milestone := range plan.Milestones {
		if milestone.ID == "" || milestone.WorkspaceID != workspaceID || !validTitle(milestone.Title) || milestone.Position < 0 || milestone.Version < 1 || milestones[milestone.ID] {
			return ErrInvalid
		}
		milestones[milestone.ID] = true
	}
	tasks := map[string]bool{}
	for _, task := range plan.Tasks {
		if err := ValidateTask(task); err != nil || task.WorkspaceID == nil || *task.WorkspaceID != workspaceID || tasks[task.ID] {
			return ErrInvalid
		}
		if task.MilestoneID != nil && !milestones[*task.MilestoneID] {
			return ErrInvalid
		}
		tasks[task.ID] = true
	}
	return nil
}
