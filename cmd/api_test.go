package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/elastic/cli/internal/cmdutil"
	"github.com/elastic/cli/internal/cmdutil/cmdutiltest"
)

// TestRawCmdLookupContextErrors verifies that newRawCmd propagates
// LookupContext errors as *cmdutil.StructuredError.
func TestRawCmdLookupContextErrors(t *testing.T) {
	oldContext := rootContext
	t.Cleanup(func() { rootContext = oldContext })

	t.Run("missing config file returns ErrCodeConfigNotFound", func(t *testing.T) {
		emptyDir := t.TempDir()
		t.Setenv("XDG_CONFIG_HOME", emptyDir)
		rootContext = ""

		cmd := newRawCmd("es")
		buf := &bytes.Buffer{}
		cmd.SetOut(buf)
		cmd.SetErr(buf)
		cmd.SetContext(context.Background())

		err := cmd.RunE(cmd, []string{"/_cat/indices"})
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

	t.Run("missing context returns ErrCodeContextNotFound", func(t *testing.T) {
		cmdutiltest.InitUserConfigDir(t)
		rootContext = "nonexistent-context"

		cmd := newRawCmd("es")
		buf := &bytes.Buffer{}
		cmd.SetOut(buf)
		cmd.SetErr(buf)
		cmd.SetContext(context.Background())

		err := cmd.RunE(cmd, []string{"/_cat/indices"})
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

// TestRawCmdDryRun verifies that newRawCmd handles --dry-run itself, printing
// the fully-resolved request (path, method, query, headers, body) without
// making a real HTTP call.
func TestRawCmdDryRun(t *testing.T) {
	t.Run("dry_run_flag_registered", func(t *testing.T) {
		cmd := newRawCmd("es")
		if cmd.Flags().Lookup("dry-run") == nil {
			t.Error("--dry-run flag not registered on es raw")
		}
	})

	t.Run("json_payload_contains_path_and_flags", func(t *testing.T) {
		cmdutiltest.InitUserConfigDir(t)

		oldCtx := rootContext
		oldFmt := rootFormat
		rootContext = "default"
		rootFormat = "json"
		t.Cleanup(func() {
			rootContext = oldCtx
			rootFormat = oldFmt
		})

		cmd := newRawCmd("es")
		buf := &bytes.Buffer{}
		cmd.SetOut(buf)
		cmd.SetErr(buf)
		cmd.SetContext(context.Background())

		if err := cmd.Flags().Set("dry-run", "true"); err != nil {
			t.Fatalf("--dry-run not registered: %v", err)
		}
		if err := cmd.Flags().Set("method", "POST"); err != nil {
			t.Fatalf("set method: %v", err)
		}

		err := cmd.RunE(cmd, []string{"/my-index/_doc"})
		if err != nil {
			t.Fatalf("expected dry-run to succeed, got: %v", err)
		}

		var out struct {
			DryRun struct {
				Path   string `json:"path"`
				Method string `json:"method"`
			} `json:"dry_run"`
		}
		if err := json.NewDecoder(buf).Decode(&out); err != nil {
			t.Fatalf("output is not valid JSON: %v\noutput: %s", err, buf.String())
		}
		if out.DryRun.Path != "/my-index/_doc" {
			t.Errorf("path: got %q, want %q", out.DryRun.Path, "/my-index/_doc")
		}
		if out.DryRun.Method != "POST" {
			t.Errorf("method: got %q, want %q", out.DryRun.Method, "POST")
		}
	})
}
