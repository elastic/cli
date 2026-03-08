package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

var abToolsData string

var abToolsCmd = &cobra.Command{
	Use:   "tools",
	Short: "Manage Agent Builder tools",
}

var abToolsListCmd = &cobra.Command{
	Use:          "list",
	Aliases:      []string{"ls"},
	Short:        "List tools",
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.ListTools(cmd.Context(), abSpace)
		if err != nil {
			return err
		}
		return abOutputList(cmd.OutOrStdout(), raw, abToolHeaders(), abToolRows)
	},
}

var abToolsGetCmd = &cobra.Command{
	Use:          "get <id>",
	Short:        "Get a tool by ID",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.GetTool(cmd.Context(), abSpace, args[0])
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

var abToolsCreateCmd = &cobra.Command{
	Use:          "create",
	Short:        "Create a tool",
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		body, err := abReadData(abToolsData)
		if err != nil {
			return err
		}
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.CreateTool(cmd.Context(), abSpace, body)
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

var abToolsUpdateCmd = &cobra.Command{
	Use:          "update <id>",
	Short:        "Update a tool by ID",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		body, err := abReadData(abToolsData)
		if err != nil {
			return err
		}
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.UpdateTool(cmd.Context(), abSpace, args[0], body)
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

var abToolsDeleteCmd = &cobra.Command{
	Use:          "delete <id>",
	Short:        "Delete a tool by ID",
	Aliases:      []string{"rm"},
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		_, err = kb.DeleteTool(cmd.Context(), abSpace, args[0])
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Deleted tool %q\n", args[0])
		return nil
	},
}

var abToolsRunCmd = &cobra.Command{
	Use:          "run <tool_id>",
	Short:        "Execute a tool",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		toolID := args[0]

		var payload map[string]any
		if abToolsData != "" {
			body, err := abReadData(abToolsData)
			if err != nil {
				return err
			}
			if err := json.Unmarshal(body, &payload); err != nil {
				return fmt.Errorf("invalid JSON for --data: %w", err)
			}
		}
		if payload == nil {
			payload = map[string]any{}
		}

		// Build the _execute request body with tool_id and tool_params.
		execBody := map[string]any{
			"tool_id":     toolID,
			"tool_params": payload,
		}
		b, err := json.Marshal(execBody)
		if err != nil {
			return err
		}

		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.ExecuteTool(cmd.Context(), abSpace, b)
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

func init() {
	agentBuilderCmd.AddCommand(abToolsCmd)
	abToolsCmd.AddCommand(abToolsListCmd)
	abToolsCmd.AddCommand(abToolsGetCmd)
	abToolsCmd.AddCommand(abToolsCreateCmd)
	abToolsCmd.AddCommand(abToolsUpdateCmd)
	abToolsCmd.AddCommand(abToolsDeleteCmd)
	abToolsCmd.AddCommand(abToolsRunCmd)

	abToolsCreateCmd.Flags().StringVarP(&abToolsData, "data", "d", "", `Tool JSON (or @file.json)`)
	abToolsUpdateCmd.Flags().StringVarP(&abToolsData, "data", "d", "", `Tool JSON (or @file.json)`)
	abToolsRunCmd.Flags().StringVarP(&abToolsData, "data", "d", "", `Tool params JSON (or @file.json)`)
}
