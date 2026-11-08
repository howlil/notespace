package searchquery

import (
	"strings"
	"unicode"
)

type StaleSearchWorkspace struct {
	ID         string
	CategoryID string
	Title      string
	Version    int
}

func SafeFTSQuery(query string) string {
	// Keep user input out of FTS5 query syntax. unicode61 applies its own
	// tokenization to indexed content, so searching Unicode letter/digit terms
	// as quoted prefixes preserves normal search while punctuation stays inert.
	terms := strings.FieldsFunc(strings.TrimSpace(query), func(r rune) bool {
		return r != '_' && !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	parts := make([]string, 0, len(terms))
	for _, term := range terms {
		if term != "" {
			parts = append(parts, `"`+term+`"*`)
		}
	}
	return strings.Join(parts, " AND ")
}
