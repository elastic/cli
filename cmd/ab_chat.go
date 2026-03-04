package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

var (
	abChatAgent          string
	abChatConversationID string
	abChatConnector      string
)

var abChatCmd = &cobra.Command{
	Use:   "chat <message>",
	Short: "Send a message to an agent",
	Long: `Send a synchronous chat message to an Agent Builder agent and print the response.

To start a new conversation, just provide a message. The response includes
a conversation_id that you can pass with --conversation-id to continue the
same conversation in subsequent calls.`,
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		input := strings.TrimSpace(args[0])
		if input == "" {
			return fmt.Errorf("message is required")
		}

		body := map[string]any{
			"input": input,
		}
		if abChatAgent != "" {
			body["agent_id"] = abChatAgent
		}
		if abChatConversationID != "" {
			body["conversation_id"] = abChatConversationID
		}
		if abChatConnector != "" {
			body["connector_id"] = abChatConnector
		}

		b, err := json.Marshal(body)
		if err != nil {
			return err
		}

		kb, err := abKibanaClient()
		if err != nil {
			return err
		}

		raw, err := kb.Converse(cmd.Context(), abSpace, b)
		if err != nil {
			return err
		}

		return abRenderChatResponse(cmd, raw)
	},
}

func abRenderChatResponse(cmd *cobra.Command, raw []byte) error {
	// If the user asked for json/yaml, emit the full response object.
	if rootFormat != "" && rootFormat != "table" {
		return abOutputJSON(cmd.OutOrStdout(), raw)
	}

	// Otherwise print a human-friendly view: the assistant message,
	// followed by the conversation_id for easy continuation.
	var resp map[string]any
	if err := json.Unmarshal(raw, &resp); err != nil {
		// Fallback: dump raw JSON.
		return abOutputJSON(cmd.OutOrStdout(), raw)
	}

	// Extract the assistant's text reply.
	reply := extractChatReply(resp)
	if reply != "" {
		fmt.Fprintln(cmd.OutOrStdout(), reply)
	} else {
		// No recognisable text field; dump the whole thing.
		return abOutputJSON(cmd.OutOrStdout(), raw)
	}

	// Print conversation_id so the user can continue.
	if cid, ok := resp["conversation_id"].(string); ok && cid != "" {
		fmt.Fprintf(cmd.ErrOrStderr(), "\nconversation_id: %s\n", cid)
	}

	return nil
}

// extractChatReply walks the response looking for the assistant's text.
func extractChatReply(resp map[string]any) string {
	// Top-level "output" field (common in converse responses).
	if s, ok := resp["output"].(string); ok && s != "" {
		return s
	}

	// Nested under messages – look for the last assistant message.
	if msgs, ok := resp["messages"].([]any); ok {
		for i := len(msgs) - 1; i >= 0; i-- {
			m, ok := msgs[i].(map[string]any)
			if !ok {
				continue
			}
			role, _ := m["role"].(string)
			if role != "assistant" {
				continue
			}
			if text, ok := m["content"].(string); ok && text != "" {
				return text
			}
		}
	}

	return ""
}

func init() {
	agentBuilderCmd.AddCommand(abChatCmd)

	abChatCmd.Flags().StringVar(&abChatAgent, "agent-id", "", "Agent ID to chat with (defaults to the Elastic AI agent)")
	abChatCmd.Flags().StringVar(&abChatConversationID, "conversation-id", "", "Continue a previous conversation")
	abChatCmd.Flags().StringVar(&abChatConnector, "connector-id", "", "Connector ID for external integrations")
}
