package activity

import (
	"strings"
	"time"
	"unicode/utf8"
)

var validActivityTypes = map[string]bool{
	"build": true, "learn": true, "read": true,
	"write": true, "exercise": true, "other": true,
}

func ValidDate(value string) bool {
	parsed, err := time.Parse(DateLayout, value)
	return err == nil && parsed.Format(DateLayout) == value
}

func validTitle(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && utf8.RuneCountInString(value) <= 160
}

func ValidActivityType(value string) bool {
	return validActivityTypes[strings.TrimSpace(value)]
}

func ValidateSession(session Session) error {
	if strings.TrimSpace(session.ID) == "" ||
		!validTitle(session.Title) ||
		!ValidActivityType(session.ActivityType) ||
		!ValidDate(session.ActivityDate) ||
		session.ActiveSeconds < 0 {
		return ErrInvalid
	}
	if strings.TrimSpace(session.StartedAt) == "" || strings.TrimSpace(session.LastHeartbeatAt) == "" {
		return ErrInvalid
	}
	if _, err := time.Parse(time.RFC3339Nano, session.StartedAt); err != nil {
		return ErrInvalid
	}
	if _, err := time.Parse(time.RFC3339Nano, session.LastHeartbeatAt); err != nil {
		return ErrInvalid
	}
	if session.EndedAt != nil {
		if _, err := time.Parse(time.RFC3339Nano, *session.EndedAt); err != nil {
			return ErrInvalid
		}
	}
	if strings.TrimSpace(session.WorkspaceID) != "" && strings.TrimSpace(session.WorkspaceTitleSnapshot) == "" {
		return ErrInvalid
	}
	if strings.TrimSpace(session.TaskID) != "" && strings.TrimSpace(session.TaskTitleSnapshot) == "" {
		return ErrInvalid
	}
	return nil
}
