package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var abAgentsData string

var abAgentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "Manage Agent Builder agents",
}

var abAgentsListCmd = &cobra.Command{
	Use:          "list",
	Aliases:      []string{"ls"},
	Short:        "List agents",
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.ListAgents(cmd.Context(), abSpace)
		if err != nil {
			return err
		}
		return abOutputList(cmd.OutOrStdout(), raw, abAgentHeaders(), abAgentRows)
	},
}

var abAgentsGetCmd = &cobra.Command{
	Use:          "get <id>",
	Short:        "Get an agent by ID",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.GetAgent(cmd.Context(), abSpace, args[0])
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

var abAgentsCreateCmd = &cobra.Command{
	Use:          "create",
	Short:        "Create an agent",
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		body, err := abReadData(abAgentsData)
		if err != nil {
			return err
		}
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.CreateAgent(cmd.Context(), abSpace, body)
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

var abAgentsUpdateCmd = &cobra.Command{
	Use:          "update <id>",
	Short:        "Update an agent by ID",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		body, err := abReadData(abAgentsData)
		if err != nil {
			return err
		}
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.UpdateAgent(cmd.Context(), abSpace, args[0], body)
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

var abAgentsDeleteCmd = &cobra.Command{
	Use:          "delete <id>",
	Short:        "Delete an agent by ID",
	Aliases:      []string{"rm"},
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		_, err = kb.DeleteAgent(cmd.Context(), abSpace, args[0])
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Deleted agent %q\n", args[0])
		return nil
	},
}

func init() {
	agentBuilderCmd.AddCommand(abAgentsCmd)
	abAgentsCmd.AddCommand(abAgentsListCmd)
	abAgentsCmd.AddCommand(abAgentsGetCmd)
	abAgentsCmd.AddCommand(abAgentsCreateCmd)
	abAgentsCmd.AddCommand(abAgentsUpdateCmd)
	abAgentsCmd.AddCommand(abAgentsDeleteCmd)

	abAgentsCreateCmd.Flags().StringVarP(&abAgentsData, "data", "d", "", `Agent JSON (or @file.json)`)
	abAgentsUpdateCmd.Flags().StringVarP(&abAgentsData, "data", "d", "", `Agent JSON (or @file.json)`)
}
