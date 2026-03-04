package cmd

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/elastic/cli/internal/client"
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
