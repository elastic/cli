package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/cmdutil"
	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/output"

	"github.com/jmespath/go-jmespath"
	"github.com/spf13/cobra"
)

var (
	esqlShowNull     bool
	esqlWaitExprs    []string
	esqlWaitInterval time.Duration
	esqlTimeout      time.Duration
)

var esQueryCmd = newCommand(commandSpec{
	Use:          "query <query>",
	Short:        "Run an ES|QL query",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		query := strings.TrimSpace(args[0])
		if query == "" {
			return errors.New("query is required")
		}

		cfgPath, err := config.DefaultPath()
		if err != nil {
			return err
		}
		ctxCfg, err := cmdutil.LookupContext(cfgPath, rootContext)
		if err != nil {
			return err
		}

		cl, err := client.NewFromContext(ctxCfg)
		if err != nil {
			return err
		}
		cl.SetTimeout(esqlTimeout)

		waitExprs, err := parseWaitExpressions(esqlWaitExprs)
		if err != nil {
			return err
		}
		if err := validateESQLWaitFlags(cmd, len(waitExprs)); err != nil {
			return err
		}

		ctx, cancel := context.WithTimeout(cmd.Context(), esqlTimeout)
		defer cancel()
		resp, raw, err := runESQLQueryWithWait(
			ctx,
			query,
			waitExprs,
			esqlWaitInterval,
			esqlTimeout,
			cl.ESQLQuery,
			sleepContext,
		)
		if err != nil {
			return err
		}

		fmtFormat := output.NormalizeFormat(rootFormat)
		opts := output.RenderOpts{
			OmitNull: !esqlShowNull,
		}
		return output.Render(cmd.OutOrStdout(), fmtFormat, resp, raw, opts)
	},
})

func init() {
	esCmd.AddCommand(esQueryCmd)
	esQueryCmd.Flags().BoolVar(&esqlShowNull, "null", false, "Include null-only columns in output (omitted by default)")
	esQueryCmd.Flags().StringArrayVar(&esqlWaitExprs, "wait", nil, "Wait condition expression (repeatable JMESPath boolean)")
	esQueryCmd.Flags().DurationVar(&esqlWaitInterval, "interval", time.Second, "Polling interval while waiting (only used with --wait)")
	esQueryCmd.Flags().DurationVar(&esqlTimeout, "timeout", 30*time.Second, "Overall timeout for query execution and waiting")
}

type waitExpression struct {
	raw      string
	compiled *jmespath.JMESPath
}

func parseWaitExpressions(exprs []string) ([]waitExpression, error) {
	waitExprs := make([]waitExpression, 0, len(exprs))
	for _, expr := range exprs {
		expr = strings.TrimSpace(expr)
		if expr == "" {
			return nil, errors.New("--wait expressions must be non-empty")
		}
		compiled, err := jmespath.Compile(expr)
		if err != nil {
			return nil, fmt.Errorf("invalid --wait expression %q: %w", expr, err)
		}
		waitExprs = append(waitExprs, waitExpression{raw: expr, compiled: compiled})
	}
	return waitExprs, nil
}

func validateESQLWaitFlags(cmd *cobra.Command, waitCount int) error {
	if esqlTimeout <= 0 {
		return errors.New("--timeout must be greater than zero")
	}
	if esqlWaitInterval <= 0 {
		return errors.New("--interval must be greater than zero")
	}
	if waitCount == 0 && cmd.Flags().Changed("interval") {
		return errors.New("--interval is only valid when --wait is specified")
	}
	return nil
}

func runESQLQueryWithWait(
	ctx context.Context,
	query string,
	waitExprs []waitExpression,
	interval time.Duration,
	timeout time.Duration,
	queryFn func(context.Context, string) (client.ESQLResponse, []byte, error),
	sleepFn func(context.Context, time.Duration) error,
) (client.ESQLResponse, []byte, error) {
	lastPending := waitConditionStrings(waitExprs)
	for {
		resp, raw, err := queryFn(ctx, query)
		if err != nil {
			if ctx.Err() != nil && len(waitExprs) > 0 {
				return client.ESQLResponse{}, nil, waitTimeoutError(timeout, lastPending)
			}
			return client.ESQLResponse{}, nil, err
		}
		if len(waitExprs) == 0 {
			return resp, raw, nil
		}

		var payload any
		if err := json.Unmarshal(raw, &payload); err != nil {
			return client.ESQLResponse{}, nil, fmt.Errorf("parse query response: %w", err)
		}

		pending, err := pendingWaitConditions(waitExprs, payload)
		if err != nil {
			return client.ESQLResponse{}, nil, err
		}
		if len(pending) == 0 {
			return resp, raw, nil
		}
		lastPending = pending
		if err := sleepFn(ctx, interval); err != nil {
			if ctx.Err() != nil {
				return client.ESQLResponse{}, nil, waitTimeoutError(timeout, pending)
			}
			return client.ESQLResponse{}, nil, err
		}
	}
}

func pendingWaitConditions(waitExprs []waitExpression, payload any) ([]string, error) {
	pending := make([]string, 0, len(waitExprs))
	for _, expr := range waitExprs {
		result, err := expr.compiled.Search(payload)
		if err != nil {
			return nil, fmt.Errorf("evaluate --wait expression %q: %w", expr.raw, err)
		}
		ok, isBool := result.(bool)
		if !isBool || !ok {
			pending = append(pending, expr.raw)
		}
	}
	return pending, nil
}

func waitConditionStrings(waitExprs []waitExpression) []string {
	out := make([]string, 0, len(waitExprs))
	for _, expr := range waitExprs {
		out = append(out, expr.raw)
	}
	return out
}

func waitTimeoutError(timeout time.Duration, pending []string) error {
	return fmt.Errorf("timed out after %s waiting for conditions: %s", timeout, strings.Join(pending, ", "))
}

func sleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
