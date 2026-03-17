package cmdutil_test

import (
	"context"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/elastic/cli/internal/cmdutil"
	cmdutil_config "github.com/elastic/cli/internal/config"
	"github.com/spf13/cobra"
)

// makeRootWithFormat returns a minimal root command that registers --format,
// mimicking how rootCmd is configured in production.
func makeRootWithFormat(format string) *cobra.Command {
	root := &cobra.Command{Use: "root"}
	root.PersistentFlags().String("format", format, "output format")
	return root
}

func TestNewCmd_BasicFields(t *testing.T) {
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use:     "list [name...]",
		Short:   "List things",
		Aliases: []string{"ls"},
		Args:    cmdutil.ArgsAny,
		Run:     func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})

	if cmd.Use != "list [name...]" {
		t.Errorf("Use = %q, want %q", cmd.Use, "list [name...]")
	}
	if cmd.Short != "List things" {
		t.Errorf("Short = %q, want %q", cmd.Short, "List things")
	}
	if len(cmd.Aliases) != 1 || cmd.Aliases[0] != "ls" {
		t.Errorf("Aliases = %v, want [ls]", cmd.Aliases)
	}
}

func TestNewCmd_SilenceUsageAlwaysTrue(t *testing.T) {
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "test",
		Run: func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})
	if !cmd.SilenceUsage {
		t.Error("expected SilenceUsage=true")
	}
}

func TestNewCmd_DefaultArgsIsArbitrary(t *testing.T) {
	// nil Args should allow any number of arguments
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "test",
		Run: func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})
	if err := cmd.ValidateArgs([]string{"a", "b", "c"}); err != nil {
		t.Errorf("expected nil from default args validator, got: %v", err)
	}
}

func TestNewCmd_NoDryRunFlagWhenOptedOut(t *testing.T) {
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use:      "test",
		NoDryRun: true,
		Run:      func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})
	if f := cmd.Flags().Lookup("dry-run"); f != nil {
		t.Error("expected --dry-run to not be registered when NoDryRun=true")
	}
}

func TestNewCmd_DryRunFlagRegisteredByDefault(t *testing.T) {
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "test",
		Run: func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})
	if f := cmd.Flags().Lookup("dry-run"); f == nil {
		t.Error("expected --dry-run to be registered by default")
	}
}

func TestNewCmd_RunInvokedWhenDryRunNotSet(t *testing.T) {
	called := false
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "test",
		Run: func(_ context.Context, _ []string, _ io.Writer, _ string) error {
			called = true
			return nil
		},
	})

	root := makeRootWithFormat("table")
	root.AddCommand(cmd)

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !called {
		t.Error("expected RunFunc to be called")
	}
}

func TestNewCmd_DryRunPreventsRunFunc(t *testing.T) {
	called := false
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "test",
		Run: func(_ context.Context, _ []string, _ io.Writer, _ string) error {
			called = true
			return nil
		},
	})

	root := makeRootWithFormat("table")
	root.AddCommand(cmd)

	if err := cmd.Flags().Set("dry-run", "true"); err != nil {
		t.Fatalf("set dry-run: %v", err)
	}
	t.Cleanup(func() { _ = cmd.Flags().Set("dry-run", "false") })

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if called {
		t.Error("expected RunFunc NOT to be called during dry-run")
	}
}

func TestNewCmd_FormatPassedToRunFunc(t *testing.T) {
	var gotFormat string
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "test",
		Run: func(_ context.Context, _ []string, _ io.Writer, format string) error {
			gotFormat = format
			return nil
		},
	})

	root := makeRootWithFormat("json")
	root.AddCommand(cmd)

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotFormat != "json" {
		t.Errorf("format = %q, want %q", gotFormat, "json")
	}
}

func TestNewCmd_FormatDefaultsToTableWhenFlagAbsent(t *testing.T) {
	var gotFormat string
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "test",
		Run: func(_ context.Context, _ []string, _ io.Writer, format string) error {
			gotFormat = format
			return nil
		},
	})
	// no parent; --format flag not present in tree
	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotFormat != "table" {
		t.Errorf("format = %q, want %q", gotFormat, "table")
	}
}

func TestNewCmd_ArgsExact(t *testing.T) {
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use:  "test <name>",
		Args: cmdutil.ArgsExact(1),
		Run:  func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})

	if err := cmd.ValidateArgs([]string{"one"}); err != nil {
		t.Errorf("expected valid for exactly 1 arg, got: %v", err)
	}
	if err := cmd.ValidateArgs([]string{"a", "b"}); err == nil {
		t.Error("expected error for 2 args with ArgsExact(1)")
	}
}

func TestNewCmd_ArgsMin(t *testing.T) {
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use:  "test <name...>",
		Args: cmdutil.ArgsMin(1),
		Run:  func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})

	if err := cmd.ValidateArgs([]string{"one", "two"}); err != nil {
		t.Errorf("expected valid for 2 args with ArgsMin(1), got: %v", err)
	}
	if err := cmd.ValidateArgs(nil); err == nil {
		t.Error("expected error for 0 args with ArgsMin(1)")
	}
}

func TestNewGroup_Fields(t *testing.T) {
	g := cmdutil.NewGroup("indices", "Index operations", "idx")

	if g.Use != "indices" {
		t.Errorf("Use = %q, want %q", g.Use, "indices")
	}
	if g.Short != "Index operations" {
		t.Errorf("Short = %q, want %q", g.Short, "Index operations")
	}
	if len(g.Aliases) != 1 || g.Aliases[0] != "idx" {
		t.Errorf("Aliases = %v, want [idx]", g.Aliases)
	}
}

func TestNewGroup_NoRunE(t *testing.T) {
	g := cmdutil.NewGroup("indices", "Index operations")
	if g.RunE != nil {
		t.Error("expected RunE to be nil for a group command")
	}
}

func TestNewCmd_DryRunOutputContainsCommandUse(t *testing.T) {
	var buf strings.Builder
	cmd := cmdutil.NewCmd(cmdutil.Spec{
		Use: "list [name...]",
		Run: func(_ context.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})

	root := makeRootWithFormat("table")
	root.AddCommand(cmd)
	cmd.SetOut(&buf)

	if err := cmd.Flags().Set("dry-run", "true"); err != nil {
		t.Fatalf("set dry-run: %v", err)
	}
	t.Cleanup(func() { _ = cmd.Flags().Set("dry-run", "false") })

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(buf.String(), "Dry run:") {
		t.Errorf("expected dry-run output, got: %q", buf.String())
	}
}

func TestNewContextCmd_ResolvesContextBeforeRun(t *testing.T) {
	dir := t.TempDir()
	cfgPath := dir + "/config.yaml"
	content := "current-context: myctx\ncontexts:\n  myctx:\n    elasticsearch_url: https://testing.invalid:9200\n    api_key: testkey\n"
	if err := os.WriteFile(cfgPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	var gotURL string
	cmd := cmdutil.NewContextCmd(cmdutil.ContextSpec{
		Use:     "test",
		CfgPath: func() (string, error) { return cfgPath, nil },
		CtxFlag: func() string { return "myctx" },
		Run: func(ctx context.Context, cmdCtx cmdutil_config.Context, args []string, out io.Writer, format string) error {
			gotURL = cmdCtx.ElasticsearchURL
			return nil
		},
	})

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotURL != "https://testing.invalid:9200" {
		t.Errorf("elasticsearch_url = %q, want %q", gotURL, "https://testing.invalid:9200")
	}
}

func TestNewContextCmd_PropagatesConfigNotFound(t *testing.T) {
	cmd := cmdutil.NewContextCmd(cmdutil.ContextSpec{
		Use:     "test",
		CfgPath: func() (string, error) { return "/nonexistent/config.yaml", nil },
		CtxFlag: func() string { return "" },
		Run:     func(_ context.Context, _ cmdutil_config.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})

	err := cmd.RunE(cmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	se, ok := err.(*cmdutil.StructuredError)
	if !ok {
		t.Fatalf("expected *cmdutil.StructuredError, got %T: %v", err, err)
	}
	if se.Code != cmdutil.ErrCodeConfigNotFound {
		t.Errorf("error code = %q, want %q", se.Code, cmdutil.ErrCodeConfigNotFound)
	}
}

func TestNewContextCmd_PropagatesContextNotFound(t *testing.T) {
	dir := t.TempDir()
	cfgPath := dir + "/config.yaml"
	content := "current-context: myctx\ncontexts:\n  myctx:\n    elasticsearch_url: https://testing.invalid:9200\n    api_key: testkey\n"
	if err := os.WriteFile(cfgPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cmd := cmdutil.NewContextCmd(cmdutil.ContextSpec{
		Use:     "test",
		CfgPath: func() (string, error) { return cfgPath, nil },
		CtxFlag: func() string { return "nonexistent" },
		Run:     func(_ context.Context, _ cmdutil_config.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})

	err := cmd.RunE(cmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	se, ok := err.(*cmdutil.StructuredError)
	if !ok {
		t.Fatalf("expected *cmdutil.StructuredError, got %T: %v", err, err)
	}
	if se.Code != cmdutil.ErrCodeContextNotFound {
		t.Errorf("error code = %q, want %q", se.Code, cmdutil.ErrCodeContextNotFound)
	}
}

func TestNewContextCmd_DryRunSkipsContextResolution(t *testing.T) {
	cfgPathCalled := false
	cmd := cmdutil.NewContextCmd(cmdutil.ContextSpec{
		Use: "test",
		CfgPath: func() (string, error) {
			cfgPathCalled = true
			return "/should/not/be/called", nil
		},
		CtxFlag: func() string { return "" },
		Run:     func(_ context.Context, _ cmdutil_config.Context, _ []string, _ io.Writer, _ string) error { return nil },
	})

	if err := cmd.Flags().Set("dry-run", "true"); err != nil {
		t.Fatalf("set dry-run: %v", err)
	}
	t.Cleanup(func() { _ = cmd.Flags().Set("dry-run", "false") })

	if err := cmd.RunE(cmd, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfgPathCalled {
		t.Error("expected CfgPath not to be called during dry-run")
	}
}
