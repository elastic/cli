package cmd

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	apperrors "github.com/elastic/cli/internal/errors"
	"github.com/elastic/cli/internal/factory"
	"github.com/elastic/cli/internal/output"
	"github.com/spf13/cobra"
)

var contextFlag string

var rootCmd = &cobra.Command{
	Use:           "elastic",
	Short:         "Use Elasticsearch APIs from the command line.",
	Long:          "Use Elasticsearch, Elasticsearch Serverless, and Elastic Cloud APIs from the command line.",
	SilenceUsage:  true,
	SilenceErrors: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

func init() {
	rootCmd.PersistentFlags().StringVar(&contextFlag, "context", "", "Context to use for this command")
	rootCmd.PersistentFlags().String("format", "text", "Output format (text|json)")
	rootCmd.AddCommand(factory.New("version", "Print version info", func(ctx factory.RunContext) (any, error) {
		return "elastic version dev", nil
	}))
}

// Execute runs the root command. Errors from factory commands are handled
// inside RunE via output.Render. Cobra-level errors (unknown commands, flag
// parse failures) are caught here and routed to the appropriate output channel.
//
// Output formatting (JSON envelope serialization) currently lives in
// factory.New's RunE rather than in a PersistentPostRunE hook on rootCmd.
// PersistentPostRunE would be the more Cobra-idiomatic location, but Cobra
// provides no first-class mechanism to pass the handler's return value from
// RunE into PostRunE — doing so would require threading data through
// cmd.SetContext, which adds complexity with no benefit at the current scale.
// If per-command middleware (tracing, audit logging) is needed in the future,
// migrating to a context-passing + PersistentPostRunE pattern is the right move.
func Execute() {
	os.Exit(executeRoot(rootCmd, os.Args[1:], rootCmd.OutOrStdout(), rootCmd.ErrOrStderr()))
}

// executeRoot runs the given command and returns an exit code.
// Cobra-level errors (unknown command, flag parse failures) are caught and
// routed to the appropriate output channel based on the --format flag.
func executeRoot(cmd *cobra.Command, args []string, stdout, stderr io.Writer) int {
	if err := cmd.Execute(); err != nil {
		if errors.Is(err, output.ErrAlreadyRendered) {
			// The error was already written as a JSON envelope to stdout by the
			// factory's RunE; just exit non-zero without printing anything else.
			return 1
		}
		if isJSONFormat(cmd, args) {
			_ = output.Render(stdout, output.FormatJSON, nil, classifyCobraError(err))
		} else {
			fmt.Fprintf(stderr, "Error: %s\n", err)
		}
		return 1
	}
	return 0
}

// isJSONFormat checks whether --format=json was requested. It first tries the
// parsed flag value, then falls back to scanning raw args because Cobra skips
// flag parsing on certain errors (e.g. unknown command).
func isJSONFormat(cmd *cobra.Command, rawArgs []string) bool {
	if f := cmd.PersistentFlags().Lookup("format"); f != nil && f.Changed {
		return f.Value.String() == output.FormatJSON
	}
	// Cobra skips flag parsing on certain errors (e.g. unknown command), so
	// the flag value may still be the default. Scan the raw args as a fallback.
	for i, arg := range rawArgs {
		if arg == "--format=json" {
			return true
		}
		if arg == "--format" && i+1 < len(rawArgs) && rawArgs[i+1] == "json" {
			return true
		}
		if arg == "--" {
			break
		}
	}
	return false
}

// classifyCobraError converts an error from cmd.Execute() into a typed
// output.OutputError so the JSON envelope carries an accurate error code.
//
// Priority:
//  1. Errors that already implement output.OutputError are passed through as-is.
//  2. Cobra "unknown command" errors → unknown_command.
//  3. pflag flag errors (unknown flag, bad syntax, etc.) → invalid_argument.
//  4. Everything else → command_failed.
func classifyCobraError(err error) output.OutputError {
	var outErr output.OutputError
	if errors.As(err, &outErr) {
		return outErr
	}
	msg := err.Error()
	if strings.HasPrefix(msg, "unknown command") {
		return &apperrors.UnknownCommandError{Cause: err}
	}
	if strings.HasPrefix(msg, "unknown flag") ||
		strings.HasPrefix(msg, "unknown shorthand flag") ||
		strings.HasPrefix(msg, "bad flag syntax") ||
		strings.HasPrefix(msg, "flag needs an argument") ||
		strings.HasPrefix(msg, "invalid argument") ||
		strings.HasPrefix(msg, "required flag") {
		return &apperrors.InvalidArgumentError{Cause: err}
	}
	return &apperrors.CommandError{Cause: err}
}
