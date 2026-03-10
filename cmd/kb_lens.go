package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/elastic/cli/internal/output"

	"github.com/spf13/cobra"
)

var (
	lensListPage    int
	lensListPerPage int
	lensCreateTitle string
	lensCreateData  string
)

var kbLensCmd = &cobra.Command{
	Use:   "lens",
	Short: "Lens visualization operations",
}

var kbLensListCmd = &cobra.Command{
	Use:          "list [search]",
	Aliases:      []string{"ls", "search"},
	Short:        "List lens visualizations",
	Args:         cobra.MaximumNArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		search := ""
		if len(args) > 0 {
			search = args[0]
		}
		return runKbLensList(cmd.Context(), cmd.OutOrStdout(), search, lensListPage, lensListPerPage, rootFormat)
	},
}

var kbLensGetCmd = &cobra.Command{
	Use:          "get <id>",
	Short:        "Get a lens visualization by ID",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbLensGet(cmd.Context(), cmd.OutOrStdout(), args[0], rootFormat)
	},
}

var kbLensDeleteCmd = &cobra.Command{
	Use:          "delete <id>",
	Aliases:      []string{"rm"},
	Short:        "Delete a lens visualization",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbLensDelete(cmd.Context(), cmd.OutOrStdout(), args[0])
	},
}

var kbLensCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a lens visualization",
	Long: `Create a lens visualization.

Supply either --title for a minimal Lens visualization, or --data with the full
JSON request body for complete control (the same JSON accepted by
POST /api/lens). Use --data=- to read from stdin.

Examples:
  elastic kb lens create --title "My Lens"
  elastic kb lens create --data '{"data":{"title":"My Lens","description":"","visualizationType":"lnsXY"}}'
  cat body.json | elastic kb lens create --data=-`,
	Args:         cobra.NoArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbLensCreate(cmd.Context(), cmd.OutOrStdout(), lensCreateTitle, lensCreateData, rootFormat)
	},
}

var kbLensSchemaCmd = &cobra.Command{
	Use:          "schema",
	Short:        "Get the lens create request schema",
	Args:         cobra.NoArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbLensSchema(cmd.OutOrStdout(), rootFormat)
	},
}

func init() {
	kbCmd.AddCommand(kbLensCmd)
	kbLensCmd.AddCommand(kbLensListCmd)
	kbLensCmd.AddCommand(kbLensGetCmd)
	kbLensCmd.AddCommand(kbLensDeleteCmd)
	kbLensCmd.AddCommand(kbLensCreateCmd)
	kbLensCmd.AddCommand(kbLensSchemaCmd)

	kbLensListCmd.Flags().IntVar(&lensListPage, "page", 0, "Page number to return")
	kbLensListCmd.Flags().IntVar(&lensListPerPage, "per-page", 0, "Number of lens visualizations per page")

	kbLensCreateCmd.Flags().StringVar(&lensCreateTitle, "title", "", "Lens visualization title (creates a minimal lens visualization)")
	kbLensCreateCmd.Flags().StringVar(&lensCreateData, "data", "", "Full JSON request body (use - for stdin)")
	kbLensCreateCmd.MarkFlagsOneRequired("title", "data")
	kbLensCreateCmd.MarkFlagsMutuallyExclusive("title", "data")
}

func runKbLensList(ctx context.Context, out io.Writer, search string, page, perPage int, format string) error {
	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	resp, err := kb.SearchLenses(ctx, search, page, perPage)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, resp)
	}

	headers, rows := lensListTable(resp.Items)
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}

func runKbLensGet(ctx context.Context, out io.Writer, id string, format string) error {
	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	lens, err := kb.GetLens(ctx, id)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, lens)
	}

	headers, rows := lensGetTable(lens)
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}

func runKbLensDelete(ctx context.Context, out io.Writer, id string) error {
	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	if err := kb.DeleteLens(ctx, id); err != nil {
		return err
	}

	fmt.Fprintf(out, "Lens visualization %q deleted.\n", id)
	return nil
}

func runKbLensCreate(ctx context.Context, out io.Writer, title, data, format string) error {
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
				"title":             title,
				"description":       "",
				"visualizationType": "lnsXY",
				"state": map[string]any{
					"datasourceStates": map[string]any{},
					"filters":          []any{},
					"query": map[string]any{
						"query":    "",
						"language": "kuery",
					},
					"visualization": map[string]any{
						"preferredSeriesType": "line",
						"layers":              []any{},
					},
				},
			},
		}
	}

	kb, err := newKibanaClient()
	if err != nil {
		return err
	}

	lens, err := kb.CreateLens(ctx, body)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, lens)
	}

	headers, rows := lensGetTable(lens)
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}

func runKbLensSchema(out io.Writer, format string) error {
	schema := lensCreateSchema()

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, schema)
	}

	headers := []string{"field", "value"}
	rows := [][]any{
		{"schema_version", schema["x-elastic-cli-schema-version"]},
		{"$id", schema["$id"]},
		{"$schema", schema["$schema"]},
		{"required_top_level", "data"},
		{"note", "use -f json or -f yaml for the full schema"},
	}
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}

func lensCreateSchema() map[string]any {
	return map[string]any{
		"$id":      "https://github.com/elastic/cli/schemas/kibana/lens-create-v1.json",
		"$schema":  "https://json-schema.org/draft/2020-12/schema",
		"title":    "Kibana lens create request",
		"type":     "object",
		"required": []string{"data"},
		"properties": map[string]any{
			"id": map[string]any{"type": "string"},
			"spaces": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "string",
				},
			},
			"data": map[string]any{
				"type":     "object",
				"required": []string{"title", "description", "visualizationType", "state"},
				"properties": map[string]any{
					"title":             map[string]any{"type": "string"},
					"description":       map[string]any{"type": "string"},
					"visualizationType": map[string]any{"type": "string"},
					"state": map[string]any{
						"type": "object",
						"required": []string{
							"datasourceStates",
							"filters",
							"query",
							"visualization",
						},
						"properties": map[string]any{
							"datasourceStates": map[string]any{"type": "object"},
							"filters": map[string]any{
								"type":  "array",
								"items": map[string]any{"type": "object"},
							},
							"query": map[string]any{
								"type":     "object",
								"required": []string{"query", "language"},
								"properties": map[string]any{
									"query":    map[string]any{"type": "string"},
									"language": map[string]any{"type": "string"},
								},
								"additionalProperties": true,
							},
							"visualization": map[string]any{"type": "object"},
						},
						"additionalProperties": true,
					},
				},
				"additionalProperties": true,
			},
		},
		"additionalProperties":           true,
		"x-elastic-cli-schema-version":   1,
		"x-elastic-cli-schema-stability": "experimental",
	}
}
