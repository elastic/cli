package cmd

import (
	"fmt"
	"os"

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
	if err := rootCmd.Execute(); err != nil {
		// Cobra-level error (e.g. unknown command). Check --format to decide
		// whether to write a JSON envelope to stdout or plain text to stderr.
		if f := rootCmd.PersistentFlags().Lookup("format"); f != nil && f.Value.String() == output.FormatJSON {
			_ = output.Render(os.Stdout, output.FormatJSON, nil, &apperrors.CommandError{Cause: err})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %s\n", err)
		}
		os.Exit(1)
	}
}
