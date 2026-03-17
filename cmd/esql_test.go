package cmd

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/cmdutil"
	"github.com/elastic/cli/internal/cmdutil/cmdutiltest"
	"github.com/spf13/cobra"
)

func TestParseWaitExpressions(t *testing.T) {
	if _, err := parseWaitExpressions([]string{" "}); err == nil {
		t.Fatal("expected error for empty expression")
	}
	if _, err := parseWaitExpressions([]string{"["}); err == nil {
		t.Fatal("expected parse error for invalid expression")
	}
}

func TestValidateESQLWaitFlags(t *testing.T) {
	oldInterval := esqlWaitInterval
	oldTimeout := esqlTimeout
	t.Cleanup(func() {
		esqlWaitInterval = oldInterval
		esqlTimeout = oldTimeout
	})

	cmd := &cobra.Command{Use: "test"}
	cmd.Flags().Duration("interval", time.Second, "")

	esqlWaitInterval = time.Second
	esqlTimeout = time.Second
	if err := validateESQLWaitFlags(cmd, 0); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}

	if err := cmd.Flags().Set("interval", "2s"); err != nil {
		t.Fatal(err)
	}
	if err := validateESQLWaitFlags(cmd, 0); err == nil {
		t.Fatal("expected validation error when interval is set without wait")
	}
}

func TestRunESQLQueryWithWaitSingleQuery(t *testing.T) {
	calls := 0
	resp, raw, err := runESQLQueryWithWait(
		context.Background(),
		"FROM logs-*",
		nil,
		time.Second,
		5*time.Second,
		func(ctx context.Context, query string) (client.ESQLResponse, []byte, error) {
			calls++
			return client.ESQLResponse{Values: [][]any{{"ok"}}}, []byte(`{"values":[["ok"]]}`), nil
		},
		sleepContext,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 query call, got %d", calls)
	}
	if len(resp.Values) != 1 || len(raw) == 0 {
		t.Fatalf("unexpected response: %#v raw=%q", resp, string(raw))
	}
}

func TestRunESQLQueryWithWaitRetriesUntilSatisfied(t *testing.T) {
	waitExprs, err := parseWaitExpressions([]string{"length(values) > `0`"})
	if err != nil {
		t.Fatal(err)
	}

	calls := 0
	resp, _, err := runESQLQueryWithWait(
		context.Background(),
		"FROM logs-*",
		waitExprs,
		time.Nanosecond,
		2*time.Second,
		func(ctx context.Context, query string) (client.ESQLResponse, []byte, error) {
			calls++
			if calls == 1 {
				return client.ESQLResponse{Values: [][]any{}}, []byte(`{"values":[]}`), nil
			}
			return client.ESQLResponse{Values: [][]any{{"ok"}}}, []byte(`{"values":[["ok"]]}`), nil
		},
		sleepContext,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 query calls, got %d", calls)
	}
	if len(resp.Values) != 1 {
		t.Fatalf("unexpected values: %#v", resp.Values)
	}
}

func TestRunESQLQueryWithWaitTimeout(t *testing.T) {
	waitExprs, err := parseWaitExpressions([]string{"length(values) > `0`"})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()

	_, _, err = runESQLQueryWithWait(
		ctx,
		"FROM logs-*",
		waitExprs,
		time.Millisecond,
		5*time.Millisecond,
		func(ctx context.Context, query string) (client.ESQLResponse, []byte, error) {
			return client.ESQLResponse{Values: [][]any{}}, []byte(`{"values":[]}`), nil
		},
		sleepContext,
	)
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !strings.Contains(err.Error(), "timed out after") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestESQLLookupContextErrors verifies that esQueryCmd.RunE propagates
// LookupContext errors as *cmdutil.StructuredError.
// RED until T015 ensures errors are returned as *cmdutil.StructuredError.
func TestESQLLookupContextErrors(t *testing.T) {
	oldContext := rootContext
	t.Cleanup(func() { rootContext = oldContext })

	t.Run("missing_context_returns_ErrCodeContextNotFound", func(t *testing.T) {
		cmdutiltest.InitUserConfigDir(t)
		rootContext = "nonexistent-context-for-testing"

		err := esQueryCmd.RunE(esQueryCmd, []string{"FROM logs-*"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if _, ok := err.(*cmdutil.StructuredError); !ok {
			t.Fatalf("expected *cmdutil.StructuredError, got %T: %v", err, err)
		}
	})
}

// TestESQLDryRunFlagRegistered verifies that esQueryCmd registers --dry-run.
// RED until T016 registers the --dry-run flag on esQueryCmd.
func TestESQLDryRunFlagRegistered(t *testing.T) {
	if esQueryCmd.Flags().Lookup("dry-run") == nil {
		t.Error("esQueryCmd does not have --dry-run flag registered")
	}
}

// TestESQLDryRunJSON verifies that esQueryCmd with --dry-run and --format=json
// prints the request payload without making a real ES call.
// RED until T016 registers --dry-run and wires cmdutil.HandleDryRun.
func TestESQLDryRunJSON(t *testing.T) {
	cmdutiltest.InitUserConfigDir(t)

	oldCtx := rootContext
	oldFmt := rootFormat
	rootContext = "default"
	rootFormat = "json"
	t.Cleanup(func() {
		rootContext = oldCtx
		rootFormat = oldFmt
	})

	if err := esQueryCmd.Flags().Set("dry-run", "true"); err != nil {
		t.Skipf("--dry-run not yet registered on esQueryCmd: %v", err)
	}
	t.Cleanup(func() { _ = esQueryCmd.Flags().Set("dry-run", "false") })

	cmd := esQueryCmd
	buf := &bytes.Buffer{}
	cmd.SetOut(buf)
	cmd.SetErr(buf)
	cmd.SetContext(context.Background())
	err := cmd.RunE(cmd, []string{"FROM logs-*"})
	if err != nil {
		t.Fatalf("expected dry-run to succeed, got: %v", err)
	}
}
