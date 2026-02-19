package cmd

import "github.com/spf13/cobra"

var docsCmd = &cobra.Command{
	Use:   "docs",
	Short: "Search, read, and ask questions about Elastic documentation",
}

func init() {
	rootCmd.AddCommand(docsCmd)
}
