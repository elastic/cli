package factory

import (
	"os"
	"path/filepath"
	"strings"
	"runtime"
	"testing"

	"github.com/elastic/cli/internal/factory/factorytest"
)

func TestResolveConfigPath(t *testing.T) {
	tests := []struct {
		name      string
		setup     func(t *testing.T)
		cleanup   func(t *testing.T)
		wantErr   bool
		errCheck  func(t *testing.T, err error)
		pathCheck func(t *testing.T, got string)
	}{
		{
			name: "$ELASTIC_CONFIG set + file exists",
			setup: func(t *testing.T) {
				tmpFile := factorytest.TempConfigFile(t, []byte("test"))
				t.Setenv("ELASTIC_CONFIG", tmpFile)
			},
			pathCheck: func(t *testing.T, got string) {
				if got != os.Getenv("ELASTIC_CONFIG") {
					t.Errorf("got %q, want %q", got, os.Getenv("ELASTIC_CONFIG"))
				}
			},
		},
		{
			name: "$ELASTIC_CONFIG set + file missing",
			setup: func(t *testing.T) {
				t.Setenv("ELASTIC_CONFIG", "/nonexistent/path/config.yml")
			},
			wantErr: true,
			errCheck: func(t *testing.T, err error) {
				if !strings.Contains(err.Error(), "$ELASTIC_CONFIG path not found") {
					t.Errorf("error %q should contain '$ELASTIC_CONFIG path not found'", err)
				}
			},
		},
		{
			name: "$ELASTIC_CONFIG set + file unreadable",
			setup: func(t *testing.T) {
				tmpFile := factorytest.TempConfigFileUnreadable(t, []byte("test"))
				t.Setenv("ELASTIC_CONFIG", tmpFile)
			},
			cleanup: func(t *testing.T) {
				if path := os.Getenv("ELASTIC_CONFIG"); path != "" {
					_ = os.Chmod(path, 0644)
				}
			},
			pathCheck: func(t *testing.T, got string) {
				// readability is checked later by Load(), not here
				if got != os.Getenv("ELASTIC_CONFIG") {
					t.Errorf("got %q, want %q", got, os.Getenv("ELASTIC_CONFIG"))
				}
			},
		},
		{
			name: "$XDG_CONFIG_HOME set",
			setup: func(t *testing.T) {
				t.Setenv("ELASTIC_CONFIG", "")
				t.Setenv("XDG_CONFIG_HOME", t.TempDir())
			},
			pathCheck: func(t *testing.T, got string) {
				want := filepath.Join(os.Getenv("XDG_CONFIG_HOME"), "elastic", "config.yml")
				if got != want {
					t.Errorf("got %q, want %q", got, want)
				}
			},
		},
		{
			name: "neither env var set",
			setup: func(t *testing.T) {
				t.Setenv("ELASTIC_CONFIG", "")
				t.Setenv("XDG_CONFIG_HOME", "")
				t.Setenv("HOME", t.TempDir())
				if runtime.GOOS == "windows" {
					t.Skip("HOME not used for path resolution on Windows")
				}
			},
			pathCheck: func(t *testing.T, got string) {
				want := filepath.Join(os.Getenv("HOME"), ".config", "elastic", "config.yml")
				if got != want {
					t.Errorf("got %q, want %q", got, want)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.setup != nil {
				tt.setup(t)
			}
			defer func() {
				if tt.cleanup != nil {
					tt.cleanup(t)
				}
			}()

			got, err := resolveConfigPath()

			if (err != nil) != tt.wantErr {
				t.Errorf("resolveConfigPath() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if err != nil && tt.errCheck != nil {
				tt.errCheck(t, err)
			} else if err == nil && tt.pathCheck != nil {
				tt.pathCheck(t, got)
			}
		})
	}
}
