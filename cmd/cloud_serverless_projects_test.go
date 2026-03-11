package cmd

import "testing"

func TestNormalizeServerlessProjectType(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{in: "elasticsearch", want: "elasticsearch"},
		{in: "Observability", want: "observability"},
		{in: "security", want: "security"},
		{in: "workplaceai", want: "workplaceai"},
		{in: "enterprise-search", wantErr: true},
	}

	for _, tt := range tests {
		got, err := normalizeServerlessProjectType(tt.in)
		if tt.wantErr {
			if err == nil {
				t.Fatalf("expected error for %q", tt.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", tt.in, err)
		}
		if got != tt.want {
			t.Fatalf("unexpected value for %q: got %q want %q", tt.in, got, tt.want)
		}
	}
}

func TestListItemsFromResponse(t *testing.T) {
	obj := map[string]any{
		"projects": []any{
			map[string]any{"id": "a"},
			map[string]any{"id": "b"},
		},
	}
	items := listItemsFromResponse(obj)
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0]["id"] != "a" || items[1]["id"] != "b" {
		t.Fatalf("unexpected ids: %#v", items)
	}
}
