package httpapi

import "strings"

func isLegacyProjectPath(path string) bool {
	return path == "/api/projects" || strings.HasPrefix(path, "/api/projects/")
}

