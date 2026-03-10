package cmd

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestLensCreateSchema(t *testing.T) {
	schema := lensCreateSchema()

	if got, want := schema["$schema"], "https://json-schema.org/draft/2020-12/schema"; got != want {
		t.Fatalf("unexpected $schema: got %v, want %q", got, want)
	}
	if got, want := schema["x-elastic-cli-schema-version"], 1; got != want {
		t.Fatalf("unexpected schema version: got %v, want %d", got, want)
	}

	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("properties should be an object, got %T", schema["properties"])
	}
	data, ok := properties["data"].(map[string]any)
	if !ok {
		t.Fatalf("properties.data should be an object, got %T", properties["data"])
	}
	if got := data["type"]; got != "object" {
		t.Fatalf("unexpected data type: got %v", got)
	}
}

func TestRunKbLensSchemaJSON(t *testing.T) {
	var buf bytes.Buffer
	if err := runKbLensSchema(&buf, "json"); err != nil {
		t.Fatalf("runKbLensSchema returned error: %v", err)
	}

	var schema map[string]any
	if err := json.Unmarshal(buf.Bytes(), &schema); err != nil {
		t.Fatalf("failed to parse json output: %v", err)
	}

	if got := schema["title"]; got != "Kibana lens create request" {
		t.Fatalf("unexpected title: %v", got)
	}
}
