package client

import (
	"testing"

	"github.com/elastic/cli/internal/config"
)

func TestNewCloudFromContext_DefaultURL(t *testing.T) {
	ctx := config.Context{APIKey: "abc"}
	c, err := NewCloudFromContext(ctx, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.baseURL != DefaultCloudURL {
		t.Fatalf("unexpected base url: got %q want %q", c.baseURL, DefaultCloudURL)
	}
}

func TestNewCloudFromContext_ValidatesURL(t *testing.T) {
	ctx := config.Context{APIKey: "abc"}
	if _, err := NewCloudFromContext(ctx, "not-a-url"); err == nil {
		t.Fatal("expected invalid cloud url error")
	}
}
