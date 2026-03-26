// Package cmdtest provides test fixtures and helpers for the cmd package.
package cmdtest

import (
	"os"
	"path/filepath"
	"testing"
)

// TempConfigFile writes content to a temporary config file and returns its path.
// The file is automatically removed when the test ends.
func TempConfigFile(t *testing.T, content []byte) string {
	t.Helper()
	tmpFile := filepath.Join(t.TempDir(), "config.yml")
	if err := os.WriteFile(tmpFile, content, 0644); err != nil {
		t.Fatal(err)
	}
	return tmpFile
}
