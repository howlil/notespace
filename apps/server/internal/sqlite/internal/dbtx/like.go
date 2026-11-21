package dbtx

import "strings"

func ContainsLikeLiteral(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "%", `\%`)
	value = strings.ReplaceAll(value, "_", `\_`)
	return "%" + value + "%"
}

func EscapeSQLiteURIPath(slashPath string) string {
	replacer := strings.NewReplacer("%", "%25", "#", "%23", "?", "%3f")
	return replacer.Replace(slashPath)
}
