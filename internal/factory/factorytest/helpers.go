// Package factorytest provides helpers and utilities for testing the factory package.
package factorytest

import (
	"os"
	"path/filepath"
	"testing"
)

// TempConfigFile creates a temporary config file for testing and returns its path.
// The caller should use t.Cleanup() or defer os.RemoveAll(tmpDir) to clean up.
func TempConfigFile(t *testing.T, content []byte) string {
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "config.yml")
	if err := os.WriteFile(tmpFile, content, 0644); err != nil {
		t.Fatal(err)
	}
	return tmpFile
}

// TempConfigFileUnreadable creates a temporary config file with no read permissions.
// The caller should call Chmod(0644) in cleanup if needed.
func TempConfigFileUnreadable(t *testing.T, content []byte) string {
	tmpFile := TempConfigFile(t, content)
	if err := os.Chmod(tmpFile, 0000); err != nil {
		t.Fatal(err)
	}
	return tmpFile
}