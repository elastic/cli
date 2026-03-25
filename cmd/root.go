package cmd

import (
	"fmt"
	"github.com/spf13/cobra"
	"os"
)

var rootCmd = &cobra.Command{
	Use:   "elastic",
	Short: "Use Elasticsearch APIs from the command line.",
	Long:  "Use Elasticsearch, Elasticsearch Serverless, and Elastic Cloud APIs from the command line.",
	RunE: func(cmd *cobra.Command, args []string) error {
		_, _ = fmt.Fprint(cmd.OutOrStdout())
		return cmd.Help()
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "An error occurred: '%s'\n", err)
		os.Exit(1)
	}
}
