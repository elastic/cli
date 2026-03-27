package cmd

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/elastic/cli/cmd/cmdtest"
	apperrors "github.com/elastic/cli/internal/errors"
	"github.com/elastic/cli/internal/output"
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

// Factory-level error with --format=json renders a JSON error envelope via
// output.Render inside RunE (the factory swallows the error, returning nil to
// Cobra). This does NOT exercise the cmd.Execute() wrapper's error path.
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
	if !errors.Is(err, output.ErrAlreadyRendered) {
		t.Fatalf("expected ErrAlreadyRendered, got: %v", err)
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

// executeRoot with --format=json and a Cobra-level error (unknown command)
// writes a JSON error envelope to stdout and returns exit code 1.
func TestExecuteRoot_CobraError_FormatJSON_WritesJSONToStdout(t *testing.T) {
	args := []string{"--format=json", "nonexistent-command"}
	rootCmd.SetArgs(args)
	t.Cleanup(func() { rootCmd.SetArgs(nil) })

	var stdout, stderr strings.Builder
	code := executeRoot(rootCmd, args, &stdout, &stderr)

	if code != 1 {
		t.Errorf("exit code = %d; want 1", code)
	}
	out := stdout.String()
	if !strings.Contains(out, `"error"`) {
		t.Errorf("stdout missing 'error' key: %q", out)
	}
	if !strings.Contains(out, "unknown_command") {
		t.Errorf("stdout missing 'unknown_command' code: %q", out)
	}
	if stderr.Len() != 0 {
		t.Errorf("stderr should be empty in JSON mode, got: %q", stderr.String())
	}
}

// executeRoot with text format and a Cobra-level error writes plain text to
// stderr and returns exit code 1.
func TestExecuteRoot_CobraError_FormatText_WritesToStderr(t *testing.T) {
	args := []string{"nonexistent-command"}
	rootCmd.SetArgs(args)
	t.Cleanup(func() { rootCmd.SetArgs(nil) })

	var stdout, stderr strings.Builder
	code := executeRoot(rootCmd, args, &stdout, &stderr)

	if code != 1 {
		t.Errorf("exit code = %d; want 1", code)
	}
	if !strings.Contains(stderr.String(), "Error:") {
		t.Errorf("stderr missing 'Error:' prefix: %q", stderr.String())
	}
	if stdout.Len() != 0 {
		t.Errorf("stdout should be empty in text mode, got: %q", stdout.String())
	}
}

// executeRoot returns 0 when the command succeeds.
func TestExecuteRoot_Success_ReturnsZero(t *testing.T) {
	yaml := `
current_context: prod
contexts:
  prod:
    elasticsearch:
      url: https://prod.es.io
`
	configPath := cmdtest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	args := []string{"version"}
	rootCmd.SetArgs(args)
	var stdout strings.Builder
	rootCmd.SetOut(&stdout)
	t.Cleanup(func() {
		rootCmd.SetArgs(nil)
		rootCmd.SetOut(nil)
	})

	var devnull strings.Builder
	code := executeRoot(rootCmd, args, &devnull, &devnull)

	if code != 0 {
		t.Errorf("exit code = %d; want 0", code)
	}
}

// classifyCobraError passes through errors that already implement
// output.OutputError instead of re-wrapping them.
func TestClassifyCobraError_OutputError_PassesThrough(t *testing.T) {
	original := &apperrors.ContextNotFoundError{Name: "prod", Available: []string{"dev"}}
	got := classifyCobraError(original)
	if got != original {
		t.Errorf("expected same pointer; got %T %v", got, got)
	}
	if got.ErrorCode() != "context_not_found" {
		t.Errorf("ErrorCode() = %q; want %q", got.ErrorCode(), "context_not_found")
	}
}

// classifyCobraError maps Cobra "unknown command" errors to unknown_command.
func TestClassifyCobraError_UnknownCommand(t *testing.T) {
	err := fmt.Errorf(`unknown command "bogus" for "elastic"`)
	got := classifyCobraError(err)
	if got.ErrorCode() != "unknown_command" {
		t.Errorf("ErrorCode() = %q; want %q", got.ErrorCode(), "unknown_command")
	}
}

// classifyCobraError maps pflag "unknown flag" errors to invalid_argument.
func TestClassifyCobraError_UnknownFlag(t *testing.T) {
	err := fmt.Errorf("unknown flag: --bogus")
	got := classifyCobraError(err)
	if got.ErrorCode() != "invalid_argument" {
		t.Errorf("ErrorCode() = %q; want %q", got.ErrorCode(), "invalid_argument")
	}
}

// classifyCobraError maps unrecognised errors to command_failed.
func TestClassifyCobraError_FallbackCommandFailed(t *testing.T) {
	err := fmt.Errorf("some internal cobra error")
	got := classifyCobraError(err)
	if got.ErrorCode() != "command_failed" {
		t.Errorf("ErrorCode() = %q; want %q", got.ErrorCode(), "command_failed")
	}
}
