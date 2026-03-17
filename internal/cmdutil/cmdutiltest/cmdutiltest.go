// Package cmdutiltest provides test helpers for commands that depend on
// internal/cmdutil and the elastic config file.
package cmdutiltest

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

const defaultConfig = `current-context: default
contexts:
  default:
    elasticsearch_url: https://testing.invalid:9200
    api_key: testkey
`

// InitUserConfigDir initialises a minimal elastic config in a temporary
// directory created by tb.TempDir(), sets the OS-appropriate environment
// variable so that os.UserConfigDir() resolves to that directory for the
// duration of the test, and returns the directory path.
//
// The config contains a single "default" context pointing at
// https://testing.invalid:9200 with a placeholder API key.
//
// On Linux/Unix the env var set is XDG_CONFIG_HOME; on Darwin it is HOME
// (UserConfigDir appends /Library/Application Support); on Windows it is
// AppData. tb.Setenv ensures each variable is restored after the test.
func InitUserConfigDir(tb testing.TB) string {
	tb.Helper()

	tmpDir := tb.TempDir()

	var (
		cfgBase string // path that os.UserConfigDir() will return
		envKey  string
		envVal  string
	)

	switch runtime.GOOS {
	case "windows":
		envKey = "AppData"
		envVal = tmpDir
		cfgBase = tmpDir
	case "darwin", "ios":
		envKey = "HOME"
		envVal = tmpDir
		cfgBase = filepath.Join(tmpDir, "Library", "Application Support")
	default: // linux, freebsd, etc.
		envKey = "XDG_CONFIG_HOME"
		envVal = tmpDir
		cfgBase = tmpDir
	}

	tb.Setenv(envKey, envVal)

	cfgDir := filepath.Join(cfgBase, "elastic")
	if err := os.MkdirAll(cfgDir, 0o700); err != nil {
		tb.Fatalf("cmdutiltest.InitUserConfigDir: mkdir %s: %v", cfgDir, err)
	}
	cfgPath := filepath.Join(cfgDir, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(defaultConfig), 0o600); err != nil {
		tb.Fatalf("cmdutiltest.InitUserConfigDir: write config: %v", err)
	}

	return cfgBase
}
