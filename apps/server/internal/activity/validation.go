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
