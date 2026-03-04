package cmd

import "github.com/spf13/cobra"

var slosCmd = &cobra.Command{
	Use:   "slos",
	Short: "SLO operations",
}

var slosListCmd = &cobra.Command{
	Use:          "list [name|pattern...]",
	Aliases:      []string{"ls"},
	Short:        "List SLOs",
	Args:         cobra.ArbitraryArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runGet(cmd.Context(), cmd.OutOrStdout(), "slos", args, rootFormat)
	},
}

var slosListDefinitionsCmd = &cobra.Command{
	Use:          "list-definitions [name|pattern...]",
	Short:        "List SLO definitions",
	Args:         cobra.ArbitraryArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runGet(cmd.Context(), cmd.OutOrStdout(), "slo-definitions", args, rootFormat)
	},
}

func init() {
	rootCmd.AddCommand(slosCmd)
	slosCmd.AddCommand(slosListCmd)
	slosCmd.AddCommand(slosListDefinitionsCmd)
}
