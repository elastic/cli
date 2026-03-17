package cmdutil_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/elastic/cli/internal/cmdutil"
)

// newTestCmd builds a minimal cobra command for testing.
func newTestCmd(registerDryRun bool) *cobra.Command {
	cmd := &cobra.Command{
		Use: "test-cmd",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	if registerDryRun {
		cmd.Flags().Bool("dry-run", false, "print resolved request without executing")
	}
	return cmd
}

func TestHandleDryRun_FlagNotRegistered(t *testing.T) {
	cmd := newTestCmd(false)
	// simulate --dry-run being passed to a command that didn't register it
	// HandleDryRun should detect the flag is absent and return ErrCodeDryRunNotSupported
	triggered, err := cmdutil.HandleDryRun(cmd, "table", nil)
	if triggered {
		t.Fatal("expected triggered=false when flag not registered")
	}
	if err == nil {
		t.Fatal("expected a StructuredError, got nil")
	}
	se, ok := err.(*cmdutil.StructuredError)
	if !ok {
		t.Fatalf("expected *StructuredError, got %T", err)
	}
	if se.Code != cmdutil.ErrCodeDryRunNotSupported {
		t.Errorf("code: got %q, want %q", se.Code, cmdutil.ErrCodeDryRunNotSupported)
	}
}

func TestHandleDryRun_FlagRegisteredNotSet(t *testing.T) {
	cmd := newTestCmd(true)
	// --dry-run registered but not set: should be a no-op
	triggered, err := cmdutil.HandleDryRun(cmd, "table", nil)
	if triggered {
		t.Fatal("expected triggered=false when flag not set")
	}
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestHandleDryRun_FlagSet_TableOutput(t *testing.T) {
	cmd := newTestCmd(true)
	if err := cmd.Flags().Set("dry-run", "true"); err != nil {
		t.Fatalf("failed to set flag: %v", err)
	}
	// add a flag so there's something to show
	cmd.Flags().String("index", "my-index", "index name")

	var buf bytes.Buffer
	triggered, err := cmdutil.HandleDryRun(cmd, "table", &buf)
	if !triggered {
		t.Fatal("expected triggered=true when flag is set")
	}
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "Dry run:") {
		t.Errorf("expected output to contain 'Dry run:', got: %s", out)
	}
}

func TestHandleDryRun_FlagSet_JSONOutput(t *testing.T) {
	cmd := newTestCmd(true)
	if err := cmd.Flags().Set("dry-run", "true"); err != nil {
		t.Fatalf("failed to set flag: %v", err)
	}
	cmd.Flags().String("index", "logs-*", "index name")

	var buf bytes.Buffer
	triggered, err := cmdutil.HandleDryRun(cmd, "json", &buf)
	if !triggered {
		t.Fatal("expected triggered=true when flag is set")
	}
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	var out struct {
		DryRun struct {
			Command string            `json:"command"`
			Flags   map[string]string `json:"flags"`
		} `json:"dry_run"`
	}
	if err := json.NewDecoder(&buf).Decode(&out); err != nil {
		t.Fatalf("output is not valid JSON: %v\noutput: %s", err, buf.String())
	}
	if out.DryRun.Command == "" {
		t.Error("expected dry_run.command to be non-empty")
	}
	if out.DryRun.Flags == nil {
		t.Error("expected dry_run.flags to be present")
	}
}
