package cmd

import (
	"fmt"
	"strings"
)

func lensListTable(lenses []map[string]any) ([]string, [][]any) {
	headers := []string{"id", "title", "description", "type", "updated_at", "updated_by"}
	rows := make([][]any, 0, len(lenses))

	for _, l := range lenses {
		id, _ := l["id"].(string)
		data, _ := l["data"].(map[string]any)
		meta, _ := l["meta"].(map[string]any)

		title := ""
		description := ""
		visType := ""
		if data != nil {
			title, _ = data["title"].(string)
			description, _ = data["description"].(string)
			visType, _ = data["visualizationType"].(string)
		}

		updatedAt := ""
		updatedBy := ""
		if meta != nil {
			updatedAt, _ = meta["updated_at"].(string)
			updatedBy, _ = meta["updated_by"].(string)
		}

		rows = append(rows, []any{id, title, description, visType, updatedAt, updatedBy})
	}

	return headers, rows
}

func lensGetTable(lens map[string]any) ([]string, [][]any) {
	rows := make([][]any, 0, 8)

	add := func(k string, v any) {
		if v == nil {
			return
		}
		if s, ok := v.(string); ok && s == "" {
			return
		}
		rows = append(rows, []any{k, v})
	}

	add("id", lens["id"])

	if data, ok := lens["data"].(map[string]any); ok {
		add("title", data["title"])
		add("description", data["description"])
		add("visualizationType", data["visualizationType"])
		if tr, ok := data["timeRange"].(map[string]any); ok {
			add("timeRange.from", tr["from"])
			add("timeRange.to", tr["to"])
		}
	}

	if meta, ok := lens["meta"].(map[string]any); ok {
		add("version", meta["version"])
		add("managed", meta["managed"])
		add("created_at", meta["created_at"])
		add("created_by", meta["created_by"])
		add("updated_at", meta["updated_at"])
		add("updated_by", meta["updated_by"])
	}

	if spaces, ok := lens["spaces"].([]any); ok && len(spaces) > 0 {
		parts := make([]string, 0, len(spaces))
		for _, s := range spaces {
			parts = append(parts, fmt.Sprint(s))
		}
		add("spaces", strings.Join(parts, ", "))
	}

	return []string{"key", "value"}, rows
}
