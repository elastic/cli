package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/output"

	"github.com/spf13/cobra"
)

var (
	dashboardListPage    int
	dashboardListPerPage int
	dashboardCreateTitle string
	dashboardCreateData  string
)

var kbDashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Dashboard operations",
}

var kbDashboardListCmd = &cobra.Command{
	Use:          "list [search]",
	Aliases:      []string{"ls", "search"},
	Short:        "List dashboards",
	Args:         cobra.MaximumNArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		search := ""
		if len(args) > 0 {
			search = args[0]
		}
		return runKbDashboardList(cmd.Context(), cmd.OutOrStdout(), search, dashboardListPage, dashboardListPerPage, rootFormat)
	},
}

var kbDashboardGetCmd = &cobra.Command{
	Use:          "get <id>",
	Short:        "Get a dashboard by ID",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbDashboardGet(cmd.Context(), cmd.OutOrStdout(), args[0], rootFormat)
	},
}

var kbDashboardDeleteCmd = &cobra.Command{
	Use:          "delete <id>",
	Aliases:      []string{"rm"},
	Short:        "Delete a dashboard",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbDashboardDelete(cmd.Context(), cmd.OutOrStdout(), args[0])
	},
}

var kbDashboardCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a dashboard",
	Long: `Create a dashboard.

Supply either --title for a minimal empty dashboard, or --data with the full
JSON request body for complete control (the same JSON accepted by
POST /api/dashboards). Use --data=- to read from stdin.

Examples:
  elastic kb dashboard create --title "My Dashboard"
  elastic kb dashboard create --data '{"data":{"title":"My Dashboard","query":{"query":"","language":"kuery"},"time_range":{"from":"now-15m","to":"now"},"refresh_interval":{"pause":true,"value":60000}}}'
  cat body.json | elastic kb dashboard create --data=-`,
	Args:         cobra.NoArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbDashboardCreate(cmd.Context(), cmd.OutOrStdout(), dashboardCreateTitle, dashboardCreateData, rootFormat)
	},
}

func init() {
	kbCmd.AddCommand(kbDashboardCmd)
	kbDashboardCmd.AddCommand(kbDashboardListCmd)
	kbDashboardCmd.AddCommand(kbDashboardGetCmd)
	kbDashboardCmd.AddCommand(kbDashboardDeleteCmd)
	kbDashboardCmd.AddCommand(kbDashboardCreateCmd)

	kbDashboardListCmd.Flags().IntVar(&dashboardListPage, "page", 0, "Page number to return")
	kbDashboardListCmd.Flags().IntVar(&dashboardListPerPage, "per-page", 0, "Number of dashboards per page")

	kbDashboardCreateCmd.Flags().StringVar(&dashboardCreateTitle, "title", "", "Dashboard title (creates a minimal empty dashboard)")
	kbDashboardCreateCmd.Flags().StringVar(&dashboardCreateData, "data", "", "Full JSON request body (use - for stdin)")
	kbDashboardCreateCmd.MarkFlagsOneRequired("title", "data")
	kbDashboardCreateCmd.MarkFlagsMutuallyExclusive("title", "data")
}

func newKibanaClient() (*client.KibanaClient, error) {
	path, err := config.DefaultPath()
	if err != nil {
		return nil, err
	}
	cfg, err := config.Load(path)
	if err != nil {
		return nil, err
	}

	ctxName := strings.TrimSpace(rootContext)
	if ctxName == "" {
		ctxName = cfg.CurrentContext
	}
	if ctxName == "" {
		return nil, fmt.Errorf("no context selected; run `elastic config context set <name> ...` and `elastic config context use <name>`")
	}

	ctxCfg, ok := cfg.Contexts[ctxName]
	if !ok {
		return nil, fmt.Errorf("context %q not found; run `elastic config context list`", ctxName)
	}

	return client.NewKibanaFromContext(ctxCfg)
}

func runKbDashboardList(ctx context.Context, out io.Writer, search string, page, perPage int, format string) error {
	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	resp, err := kb.SearchDashboards(ctx, search, page, perPage)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, resp)
	}

	headers, rows := dashboardListTable(resp.Dashboards)
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}

func runKbDashboardGet(ctx context.Context, out io.Writer, id string, format string) error {
	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	dashboard, err := kb.GetDashboard(ctx, id)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, dashboard)
	}

	headers, rows := dashboardGetTable(dashboard)
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}

func runKbDashboardDelete(ctx context.Context, out io.Writer, id string) error {
	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	if err := kb.DeleteDashboard(ctx, id); err != nil {
		return err
	}

	fmt.Fprintf(out, "Dashboard %q deleted.\n", id)
	return nil
}

func runKbDashboardCreate(ctx context.Context, out io.Writer, title, data, format string) error {
	var body map[string]any

	if data != "" {
		raw := []byte(data)
		if data == "-" {
			var err error
			raw, err = io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("read stdin: %w", err)
			}
		}
		if err := json.Unmarshal(raw, &body); err != nil {
			return fmt.Errorf("parse --data JSON: %w", err)
		}
	} else {
		body = map[string]any{
			"data": map[string]any{
				"title": title,
				"query": map[string]any{
					"query":    "",
					"language": "kuery",
				},
				"time_range": map[string]any{
					"from": "now-15m",
					"to":   "now",
				},
				"refresh_interval": map[string]any{
					"pause": true,
					"value": 60000,
				},
			},
		}
	}

	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	dashboard, err := kb.CreateDashboard(ctx, body)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, dashboard)
	}

	headers, rows := dashboardGetTable(dashboard)
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}
