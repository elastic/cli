package cmd

import (
	"fmt"
	"os"

	"github.com/elastic/cli/internal/factory"
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
	rootCmd.AddCommand(factory.New("version", "Print version info", func(ctx factory.RunContext) error {
		fmt.Fprintln(os.Stdout, "elastic version dev")
		return nil
	}))
}

// Execute runs the root command and writes any error to stderr.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %s\n", err)
		os.Exit(1)
	}
}
