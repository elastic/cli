package cmd

import (
	"path"
	"strings"
)

// joinPatterns trims and joins non-empty patterns into a comma-separated
// string suitable for Elasticsearch name/pattern APIs.
// Returns "*" if no non-empty patterns remain.
func joinPatterns(patterns []string) string {
	trimmed := make([]string, 0, len(patterns))
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p != "" {
			trimmed = append(trimmed, p)
		}
	}
	if len(trimmed) == 0 {
		return "*"
	}
	return strings.Join(trimmed, ",")
}

func matchesAny(name string, patterns []string) bool {
	if len(patterns) == 0 {
		return true
	}
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if name == p {
			return true
		}
		if ok, _ := path.Match(p, name); ok {
			return true
		}
	}
	return false
}
