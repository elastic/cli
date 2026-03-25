package cmd

import (
	"bytes"
	"context"
	"os"
	"testing"

	"github.com/elastic/cli/internal/cmdutil"
	"github.com/elastic/cli/internal/cmdutil/cmdutiltest"
	"github.com/spf13/cobra"
)

// TestESListCommandsLookupContextErrors verifies that the es list/health
// commands propagate LookupContext errors as *cmdutil.StructuredError.
// Context resolution is handled by NewContextCmd, so we test via RunE.
func TestESListCommandsLookupContextErrors(t *testing.T) {
	type cmdEntry struct {
		name string
		cmd  *cobra.Command
	}

	cases := []cmdEntry{
		{"esIndicesListCmd", esIndicesListCmd},
		{"esDataStreamsListCmd", esDataStreamsListCmd},
		{"esRemoteClustersListCmd", esRemoteClustersListCmd},
		{"esClusterHealthCmd", esClusterHealthCmd},
	}

	for _, tc := range cases {
		tc := tc

		t.Run(tc.name+"/missing_config_returns_ErrCodeConfigNotFound", func(t *testing.T) {
			configDir := cmdutiltest.InitUserConfigDir(t)
			os.RemoveAll(configDir)

			oldCtx := rootContext
			t.Cleanup(func() { rootContext = oldCtx })
			rootContext = ""

			tc.cmd.SetContext(context.Background())
			err := tc.cmd.RunE(tc.cmd, nil)
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
		})

		t.Run(tc.name+"/missing_context_returns_ErrCodeContextNotFound", func(t *testing.T) {
			cmdutiltest.InitUserConfigDir(t)

			oldCtx := rootContext
			t.Cleanup(func() { rootContext = oldCtx })
			rootContext = "nonexistent-context"

			tc.cmd.SetContext(context.Background())
			err := tc.cmd.RunE(tc.cmd, nil)
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
		})
	}
}

// TestESListCommandsDryRun verifies that --dry-run is registered on each es
// list/health command and that invoking it returns success without a real
// Elasticsearch call.
func TestESListCommandsDryRun(t *testing.T) {
	type cmdEntry struct {
		name string
		cmd  *cobra.Command
	}

	cases := []cmdEntry{
		{"esIndicesListCmd", esIndicesListCmd},
		{"esDataStreamsListCmd", esDataStreamsListCmd},
		{"esRemoteClustersListCmd", esRemoteClustersListCmd},
		{"esClusterHealthCmd", esClusterHealthCmd},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name+"/dry_run_flag_registered", func(t *testing.T) {
			f := tc.cmd.Flags().Lookup("dry-run")
			if f == nil {
				t.Errorf("%s: --dry-run flag not registered", tc.name)
			}
		})

		t.Run(tc.name+"/dry_run_succeeds", func(t *testing.T) {
			cmdutiltest.InitUserConfigDir(t)

			oldCtx := rootContext
			oldFmt := rootFormat
			rootContext = "default"
			rootFormat = "table"
			t.Cleanup(func() {
				rootContext = oldCtx
				rootFormat = oldFmt
			})

			buf := &bytes.Buffer{}
			tc.cmd.SetOut(buf)
			tc.cmd.SetErr(buf)

			if err := tc.cmd.Flags().Set("dry-run", "true"); err != nil {
				t.Skipf("--dry-run not yet registered on %s: %v", tc.name, err)
			}
			t.Cleanup(func() { _ = tc.cmd.Flags().Set("dry-run", "false") })

			err := tc.cmd.RunE(tc.cmd, nil)
			if err != nil {
				t.Fatalf("expected dry-run to succeed, got: %v", err)
			}
		})
	}
}
