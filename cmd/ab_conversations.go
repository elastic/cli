package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var abConversationsCmd = &cobra.Command{
	Use:     "conversations",
	Short:   "Manage Agent Builder conversations",
	Aliases: []string{"conv"},
}

var abConversationsListCmd = &cobra.Command{
	Use:          "list",
	Aliases:      []string{"ls"},
	Short:        "List conversations",
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.ListConversations(cmd.Context(), abSpace)
		if err != nil {
			return err
		}
		return abOutputList(cmd.OutOrStdout(), raw, abConversationHeaders(), abConversationRows)
	},
}

var abConversationsGetCmd = &cobra.Command{
	Use:          "get <id>",
	Short:        "Get a conversation by ID",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		raw, err := kb.GetConversation(cmd.Context(), abSpace, args[0])
		if err != nil {
			return err
		}
		return abOutputJSON(cmd.OutOrStdout(), raw)
	},
}

var abConversationsDeleteCmd = &cobra.Command{
	Use:          "delete <id>",
	Short:        "Delete a conversation by ID",
	Aliases:      []string{"rm"},
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		kb, err := abKibanaClient()
		if err != nil {
			return err
		}
		_, err = kb.DeleteConversation(cmd.Context(), abSpace, args[0])
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Deleted conversation %q\n", args[0])
		return nil
	},
}

func init() {
	agentBuilderCmd.AddCommand(abConversationsCmd)
	abConversationsCmd.AddCommand(abConversationsListCmd)
	abConversationsCmd.AddCommand(abConversationsGetCmd)
	abConversationsCmd.AddCommand(abConversationsDeleteCmd)
}
