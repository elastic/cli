package cmd

import (
	"strings"
	"testing"

	"github.com/elastic/cli/cmd/cmdtest"
)

func TestRootCmd_UseAndShort(t *testing.T) {
	if rootCmd.Use != "elastic" {
		t.Errorf("rootCmd.Use = %q; want %q", rootCmd.Use, "elastic")
	}
	if rootCmd.Short == "" {
		t.Error("rootCmd.Short is empty")
	}
}

func TestRootCmd_ContextFlag(t *testing.T) {
	if rootCmd.PersistentFlags().Lookup("context") == nil {
		t.Error("--context persistent flag not registered on rootCmd")
	}
}

func TestRootCmd_FactoryCommandPresent(t *testing.T) {
	found := false
	for _, cmd := range rootCmd.Commands() {
		if cmd.Use == "version" {
			found = true
			break
		}
	}
	if !found {
		t.Error("factory-produced 'version' command not found in rootCmd.Commands()")
	}
}

func TestRootCmd_SilenceUsage(t *testing.T) {
	if !rootCmd.SilenceUsage {
		t.Error("rootCmd.SilenceUsage should be true")
	}
}

func TestRootCmd_SilenceErrors(t *testing.T) {
	if !rootCmd.SilenceErrors {
		t.Error("rootCmd.SilenceErrors should be true")
	}
}

func TestRootCmd_ContextFlag_UnknownContext_ErrorContainsNotFound(t *testing.T) {
	yaml := `
current_context: prod
contexts:
  prod:
    elasticsearch:
      url: https://prod.es.io
  staging:
    elasticsearch:
      url: https://staging.es.io
`
	configPath := cmdtest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	rootCmd.SetArgs([]string{"version", "--context=bogus"})
	t.Cleanup(func() { rootCmd.SetArgs(nil) })

	err := rootCmd.Execute()
	if err == nil {
		t.Fatal("expected error for unknown context, got nil")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q should contain 'not found'", err.Error())
	}
}

func TestRootCmd_FormatFlag(t *testing.T) {
	if rootCmd.PersistentFlags().Lookup("format") == nil {
		t.Error("--format persistent flag not registered on rootCmd")
	}
}

// Execute() with --format=json and a failing command writes JSON error
// envelope to stdout instead of plain text to stderr.
func TestRootCmd_FormatJSON_FailingCommand_WritesJSONToStdout(t *testing.T) {
	yaml := `
current_context: prod
contexts:
  prod:
    elasticsearch:
      url: https://prod.es.io
`
	configPath := cmdtest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	rootCmd.SetArgs([]string{"version", "--format=json", "--context=bogus"})
	t.Cleanup(func() {
		rootCmd.SetArgs(nil)
		rootCmd.SetOut(nil)
		rootCmd.ResetFlags()
		// Re-register flags after reset.
		rootCmd.PersistentFlags().StringVar(&contextFlag, "context", "", "Context to use for this command")
		rootCmd.PersistentFlags().String("format", "text", "Output format (text|json)")
	})

	var outBuf strings.Builder
	rootCmd.SetOut(&outBuf)

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("expected nil error (handled by Render), got: %v", err)
	}

	out := outBuf.String()
	if !strings.Contains(out, `"error"`) {
		t.Errorf("stdout missing 'error' key: %q", out)
	}
	if !strings.Contains(out, "context_not_found") {
		t.Errorf("stdout missing 'context_not_found': %q", out)
	}
}

// every registered subcommand inherits --format persistent flag via root.
func TestRootCmd_AllSubcommands_InheritFormatFlag(t *testing.T) {
	for _, cmd := range rootCmd.Commands() {
		if cmd.Root().PersistentFlags().Lookup("format") == nil {
			t.Errorf("subcommand %q: --format persistent flag not found on root", cmd.Use)
		}
	}
}

// --help output contains --format.
func TestRootCmd_VersionHelp_ContainsFormatFlag(t *testing.T) {
	var buf strings.Builder
	rootCmd.SetOut(&buf)
	t.Cleanup(func() { rootCmd.SetOut(nil) })

	rootCmd.SetArgs([]string{"version", "--help"})
	t.Cleanup(func() { rootCmd.SetArgs(nil) })

	_ = rootCmd.Execute()

	if !strings.Contains(buf.String(), "--format") {
		t.Errorf("help output missing --format; got:\n%s", buf.String())
	}
}
