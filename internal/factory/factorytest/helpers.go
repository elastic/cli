// Package factorytest provides helpers and utilities for testing the factory package.
package factorytest

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// TempConfigFile creates a temporary config file for testing and returns its path.
// The caller should use t.Cleanup() or defer os.RemoveAll(tmpDir) to clean up.
func TempConfigFile(t *testing.T, content []byte) string {
	t.Helper()
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "config.yml")
	if err := os.WriteFile(tmpFile, content, 0644); err != nil {
		t.Fatal(err)
	}
	return tmpFile
}

// TempDataFile creates a temporary file with the given content and returns its
// path. Unlike TempConfigFile, it uses a generic filename and is intended for
// non-config test fixtures such as JSON request body payloads.
func TempDataFile(t *testing.T, content []byte) string {
	t.Helper()
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "data.json")
	if err := os.WriteFile(tmpFile, content, 0644); err != nil {
		t.Fatal(err)
	}
	return tmpFile
}

// TempConfigFileUnreadable creates a temporary config file with no read permissions.
// The caller should call Chmod(0644) in cleanup if needed.
func TempConfigFileUnreadable(t *testing.T, content []byte) string {
	if runtime.GOOS == "windows" {
		t.Skip("file permission restrictions via chmod are not enforced on Windows")
	}
	tmpFile := TempConfigFile(t, content)
	if err := os.Chmod(tmpFile, 0000); err != nil {
		t.Fatal(err)
	}
	return tmpFile
}
