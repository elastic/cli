package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/output"
	"github.com/spf13/cobra"
)

var (
	cloudURL           string
	serverlessType     string
	serverlessData     string
	cloudServerlessCmd = &cobra.Command{
		Use:   "serverless",
		Short: "Elastic Cloud Serverless operations",
	}
	cloudServerlessProjectsCmd = &cobra.Command{
		Use:   "projects",
		Short: "Manage Elastic Cloud Serverless projects",
	}
)

var cloudServerlessProjectsListCmd = &cobra.Command{
	Use:          "list",
	Aliases:      []string{"ls"},
	Short:        "List serverless projects",
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		cl, err := newCloudClient(cloudURL)
		if err != nil {
			return err
		}
		projectType, err := normalizeServerlessProjectType(serverlessType)
		if err != nil {
			return err
		}
		resp, err := cl.ListServerlessProjects(cmd.Context(), projectType)
		if err != nil {
			return err
		}
		if resp.StatusCode >= 400 {
			return cloudAPIError(resp)
		}

		var parsed any
		if err := json.Unmarshal(resp.Body, &parsed); err != nil {
			return fmt.Errorf("parse response: %w", err)
		}
		items := listItemsFromResponse(parsed)
		return output.RenderRows(cmd.OutOrStdout(), output.NormalizeFormat(rootFormat), cloudProjectHeaders(), cloudProjectRows(items), parsed)
	},
}

var cloudServerlessProjectsGetCmd = &cobra.Command{
	Use:          "get <id>",
	Short:        "Get a serverless project",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		cl, err := newCloudClient(cloudURL)
		if err != nil {
			return err
		}
		projectType, err := normalizeServerlessProjectType(serverlessType)
		if err != nil {
			return err
		}
		resp, err := cl.GetServerlessProject(cmd.Context(), projectType, args[0])
		if err != nil {
			return err
		}
		if resp.StatusCode >= 400 {
			return cloudAPIError(resp)
		}
		return abOutputJSON(cmd.OutOrStdout(), resp.Body)
	},
}

var cloudServerlessProjectsCreateCmd = &cobra.Command{
	Use:          "create",
	Short:        "Create a serverless project",
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		body, err := cloudReadData(serverlessData)
		if err != nil {
			return err
		}
		cl, err := newCloudClient(cloudURL)
		if err != nil {
			return err
		}
		projectType, err := normalizeServerlessProjectType(serverlessType)
		if err != nil {
			return err
		}
		resp, err := cl.CreateServerlessProject(cmd.Context(), projectType, body)
		if err != nil {
			return err
		}
		if resp.StatusCode >= 400 {
			return cloudAPIError(resp)
		}
		return abOutputJSON(cmd.OutOrStdout(), resp.Body)
	},
}

var cloudServerlessProjectsUpdateCmd = &cobra.Command{
	Use:          "update <id>",
	Short:        "Update a serverless project",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		body, err := cloudReadData(serverlessData)
		if err != nil {
			return err
		}
		cl, err := newCloudClient(cloudURL)
		if err != nil {
			return err
		}
		projectType, err := normalizeServerlessProjectType(serverlessType)
		if err != nil {
			return err
		}
		resp, err := cl.UpdateServerlessProject(cmd.Context(), projectType, args[0], body)
		if err != nil {
			return err
		}
		if resp.StatusCode >= 400 {
			return cloudAPIError(resp)
		}
		return abOutputJSON(cmd.OutOrStdout(), resp.Body)
	},
}

var cloudServerlessProjectsDeleteCmd = &cobra.Command{
	Use:          "delete <id>",
	Aliases:      []string{"rm"},
	Short:        "Delete a serverless project",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		cl, err := newCloudClient(cloudURL)
		if err != nil {
			return err
		}
		projectType, err := normalizeServerlessProjectType(serverlessType)
		if err != nil {
			return err
		}
		resp, err := cl.DeleteServerlessProject(cmd.Context(), projectType, args[0])
		if err != nil {
			return err
		}
		if resp.StatusCode >= 400 {
			return cloudAPIError(resp)
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Deleted serverless project %q (%s)\n", args[0], projectType)
		return nil
	},
}

func init() {
	cloudCmd.AddCommand(cloudServerlessCmd)
	cloudServerlessCmd.AddCommand(cloudServerlessProjectsCmd)
	cloudServerlessProjectsCmd.AddCommand(cloudServerlessProjectsListCmd)
	cloudServerlessProjectsCmd.AddCommand(cloudServerlessProjectsGetCmd)
	cloudServerlessProjectsCmd.AddCommand(cloudServerlessProjectsCreateCmd)
	cloudServerlessProjectsCmd.AddCommand(cloudServerlessProjectsUpdateCmd)
	cloudServerlessProjectsCmd.AddCommand(cloudServerlessProjectsDeleteCmd)

	for _, c := range []*cobra.Command{
		cloudServerlessProjectsListCmd,
		cloudServerlessProjectsGetCmd,
		cloudServerlessProjectsCreateCmd,
		cloudServerlessProjectsUpdateCmd,
		cloudServerlessProjectsDeleteCmd,
	} {
		c.Flags().StringVar(&cloudURL, "cloud-url", client.DefaultCloudURL, "Elastic Cloud API endpoint")
		c.Flags().StringVar(&serverlessType, "type", "elasticsearch", "Serverless project type (elasticsearch|observability|security|workplaceai)")
	}
	cloudServerlessProjectsCreateCmd.Flags().StringVarP(&serverlessData, "data", "d", "", "Project JSON (or @file.json)")
	cloudServerlessProjectsUpdateCmd.Flags().StringVarP(&serverlessData, "data", "d", "", "Project JSON (or @file.json)")
}

func normalizeServerlessProjectType(v string) (string, error) {
	v = strings.ToLower(strings.TrimSpace(v))
	switch v {
	case "elasticsearch", "observability", "security", "workplaceai":
		return v, nil
	default:
		return "", fmt.Errorf("unsupported serverless project type %q (try: elasticsearch|observability|security|workplaceai)", v)
	}
}

func cloudReadData(data string) ([]byte, error) {
	data = strings.TrimSpace(data)
	if data == "" {
		return nil, errors.New("--data/-d is required")
	}
	if strings.HasPrefix(data, "@") {
		b, err := os.ReadFile(strings.TrimPrefix(data, "@"))
		if err != nil {
			return nil, fmt.Errorf("read data file: %w", err)
		}
		return b, nil
	}
	return []byte(data), nil
}

func cloudAPIError(resp client.RawResponse) error {
	msg := strings.TrimSpace(string(resp.Body))
	if msg == "" {
		msg = http.StatusText(resp.StatusCode)
	}
	return fmt.Errorf("cloud api error (%d): %s", resp.StatusCode, msg)
}

func listItemsFromResponse(v any) []map[string]any {
	switch x := v.(type) {
	case []any:
		return castMapSlice(x)
	case map[string]any:
		for _, key := range []string{"projects", "items", "results", "data"} {
			if raw, ok := x[key]; ok {
				if arr, ok := raw.([]any); ok {
					return castMapSlice(arr)
				}
			}
		}
		return []map[string]any{x}
	default:
		return nil
	}
}

func castMapSlice(items []any) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func cloudProjectHeaders() []string {
	return []string{"id", "name", "alias", "type", "region_id", "phase"}
}

func cloudProjectRows(items []map[string]any) [][]any {
	rows := make([][]any, 0, len(items))
	for _, m := range items {
		rows = append(rows, []any{
			mapStr(m, "id"),
			mapStr(m, "name"),
			mapStr(m, "alias"),
			mapStr(m, "type"),
			mapStr(m, "region_id"),
			mapStr(m, "phase"),
		})
	}
	return rows
}
