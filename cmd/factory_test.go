package cmd

import (
	"bytes"
	"context"
	"testing"

	"github.com/spf13/cobra"
)

// TestNewCommand_NoDryRun verifies that commands built with NoDryRun:true behave
// like plain cobra commands.
func TestNewCommand_NoDryRun(t *testing.T) {
	ran := false
	cmd := newCommand(commandSpec{
		Use:      "noop",
		NoDryRun: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			ran = true
			return nil
		},
	})

	if cmd.Flags().Lookup("dry-run") != nil {
		t.Error("expected no --dry-run flag when NoDryRun is true")
	}

	cmd.SetOut(&bytes.Buffer{})
	cmd.SetContext(context.Background())
	if err := cmd.Execute(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ran {
		t.Error("RunE was not called")
	}
}

// TestNewCommand_DryRun_FlagRegistered verifies that --dry-run is registered by default.
func TestNewCommand_DryRun_FlagRegistered(t *testing.T) {
	cmd := newCommand(commandSpec{
		Use: "dr",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	})

	if cmd.Flags().Lookup("dry-run") == nil {
		t.Error("expected --dry-run flag to be registered by default")
	}
}

// TestNewCommand_DryRun_SkipsRunE verifies that when --dry-run is set,
// PersistentPreRunE handles the dry-run output and RunE is not called.
func TestNewCommand_DryRun_SkipsRunE(t *testing.T) {
	ran := false
	cmd := newCommand(commandSpec{
		Use: "dr",
		RunE: func(cmd *cobra.Command, args []string) error {
			ran = true
			return nil
		},
	})

	oldFmt := rootFormat
	rootFormat = "table"
	t.Cleanup(func() { rootFormat = oldFmt })

	cmd.SetArgs([]string{"--dry-run"})
	cmd.SetOut(&bytes.Buffer{})
	cmd.SetErr(&bytes.Buffer{})
	cmd.SetContext(context.Background())

	// When --dry-run is set, Execute() returns nil but RunE should not be called
	if err := cmd.Execute(); err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if ran {
		t.Error("RunE should not have been called when --dry-run is set")
	}
}

// TestNewCommand_DryRun_NotSet_CallsRunE verifies that RunE is called normally
// when --dry-run is registered but not set.
func TestNewCommand_DryRun_NotSet_CallsRunE(t *testing.T) {
	ran := false
	cmd := newCommand(commandSpec{
		Use: "dr",
		RunE: func(cmd *cobra.Command, args []string) error {
			ran = true
			return nil
		},
	})

	cmd.SetOut(&bytes.Buffer{})
	cmd.SetContext(context.Background())
	if err := cmd.Execute(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ran {
		t.Error("RunE should have been called when --dry-run is not set")
	}
}
