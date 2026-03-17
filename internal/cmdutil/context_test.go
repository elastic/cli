package cmdutil_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/elastic/cli/internal/cmdutil"
)

func writeTempConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write temp config: %v", err)
	}
	return path
}

func TestLookupContext(t *testing.T) {
	const validConfig = `
current-context: default
contexts:
  default:
    elasticsearch_url: https://testing.invalid:9200
    api_key: abc123
  staging:
    elasticsearch_url: https://staging.example.com
    api_key: xyz789
`

	tests := []struct {
		name        string
		cfgPath     string
		ctxFlag     string
		wantURL     string
		wantErrCode string
	}{
		{
			name:    "valid context via current-context",
			cfgPath: "valid",
			ctxFlag: "",
			wantURL: "https://testing.invalid:9200",
		},
		{
			name:    "--context override selects named context",
			cfgPath: "valid",
			ctxFlag: "staging",
			wantURL: "https://staging.example.com",
		},
		{
			name:        "missing config file returns ErrCodeConfigNotFound",
			cfgPath:     "/nonexistent/path/config.yaml",
			ctxFlag:     "",
			wantErrCode: cmdutil.ErrCodeConfigNotFound,
		},
		{
			name:        "named context not in config returns ErrCodeContextNotFound",
			cfgPath:     "valid",
			ctxFlag:     "missing-context",
			wantErrCode: cmdutil.ErrCodeContextNotFound,
		},
		{
			name:        "empty current-context with no ctxFlag returns ErrCodeNoContextSelected",
			cfgPath:     "empty_current",
			ctxFlag:     "",
			wantErrCode: cmdutil.ErrCodeNoContextSelected,
		},
	}

	validPath := writeTempConfig(t, validConfig)
	emptyCurrentPath := writeTempConfig(t, `
contexts:
  default:
    elasticsearch_url: https://testing.invalid:9200
`)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Lazily create temp files only once.
			var cfgPath string
			switch tt.cfgPath {
			case "valid":
				cfgPath = validPath
			case "empty_current":
				cfgPath = emptyCurrentPath
			default:
				cfgPath = tt.cfgPath
			}

			ctx, err := cmdutil.LookupContext(cfgPath, tt.ctxFlag)

			if tt.wantErrCode != "" {
				if err == nil {
					t.Fatalf("expected error with code %q, got nil", tt.wantErrCode)
				}
				se, ok := err.(*cmdutil.StructuredError)
				if !ok {
					t.Fatalf("expected *StructuredError, got %T: %v", err, err)
				}
				if se.Code != tt.wantErrCode {
					t.Errorf("error code = %q, want %q", se.Code, tt.wantErrCode)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ctx.ElasticsearchURL != tt.wantURL {
				t.Errorf("ElasticsearchURL = %q, want %q", ctx.ElasticsearchURL, tt.wantURL)
			}
		})
	}
}
