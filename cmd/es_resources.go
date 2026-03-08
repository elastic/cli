package cmd

import "github.com/spf13/cobra"

var esIndicesCmd = &cobra.Command{
	Use:     "indices",
	Short:   "Index operations",
	Aliases: []string{"idx"},
}

var esIndicesListCmd = &cobra.Command{
	Use:          "list [name|pattern...]",
	Aliases:      []string{"ls"},
	Short:        "List indices",
	Args:         cobra.ArbitraryArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runGet(cmd.Context(), cmd.OutOrStdout(), "indices", args, rootFormat)
	},
}

var esDataStreamsCmd = &cobra.Command{
	Use:     "data-streams",
	Short:   "Data stream operations",
	Aliases: []string{"ds"},
}

var esDataStreamsListCmd = &cobra.Command{
	Use:          "list [name|pattern...]",
	Aliases:      []string{"ls"},
	Short:        "List data streams",
	Args:         cobra.ArbitraryArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runGet(cmd.Context(), cmd.OutOrStdout(), "data-streams", args, rootFormat)
	},
}

var esRemoteClustersCmd = &cobra.Command{
	Use:     "remote-clusters",
	Short:   "Remote cluster operations",
	Aliases: []string{"rc"},
}

var esRemoteClustersListCmd = &cobra.Command{
	Use:          "list [name|pattern...]",
	Aliases:      []string{"ls"},
	Short:        "List remote clusters",
	Args:         cobra.ArbitraryArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runGet(cmd.Context(), cmd.OutOrStdout(), "remote-clusters", args, rootFormat)
	},
}

var esClusterCmd = &cobra.Command{
	Use:   "cluster",
	Short: "Cluster operations",
}

var esClusterHealthCmd = &cobra.Command{
	Use:          "health",
	Short:        "Get cluster health",
	Args:         cobra.NoArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runGet(cmd.Context(), cmd.OutOrStdout(), "cluster-health", args, rootFormat)
	},
}

func init() {
	esCmd.AddCommand(esIndicesCmd)
	esIndicesCmd.AddCommand(esIndicesListCmd)

	esCmd.AddCommand(esDataStreamsCmd)
	esDataStreamsCmd.AddCommand(esDataStreamsListCmd)

	esCmd.AddCommand(esRemoteClustersCmd)
	esRemoteClustersCmd.AddCommand(esRemoteClustersListCmd)

	esCmd.AddCommand(esClusterCmd)
	esClusterCmd.AddCommand(esClusterHealthCmd)
}
