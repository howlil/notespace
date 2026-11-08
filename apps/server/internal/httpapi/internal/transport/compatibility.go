package transport

import "strings"

func IsLegacyProjectPath(path string) bool {
	return path == "/api/projects" || strings.HasPrefix(path, "/api/projects/")
}
