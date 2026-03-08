package cmd

import (
	"context"
	"fmt"
	"strings"

	"github.com/charmbracelet/glamour"
	"github.com/elastic/cli/internal/client"
	"github.com/spf13/cobra"
)

var docsReadRaw bool

var docsReadCmd = &cobra.Command{
	Use:   "read <path|url|query>",
	Short: "Read an Elastic documentation page",
	Long: `Read an Elastic documentation page rendered with colours and formatting.

The argument can be:
  - A docs path:    /reference/elasticsearch
  - A full URL:     https://www.elastic.co/docs/reference/elasticsearch
  - A search query: "ingest pipelines"  (reads the first search result)

Use --raw to output the unrendered markdown.

Examples:
  elastic docs read /reference/elasticsearch
  elastic docs read https://www.elastic.co/docs/reference/elasticsearch
  elastic docs read "ingest pipelines"
  elastic docs read /reference/elasticsearch --raw`,
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		input := strings.TrimSpace(args[0])
		if input == "" {
			return fmt.Errorf("path, URL, or query is required")
		}

		path, err := resolveDocsPath(cmd.Context(), input)
		if err != nil {
			return err
		}

		md, err := client.DocsRead(cmd.Context(), path)
		if err != nil {
			return err
		}

		if docsReadRaw {
			_, err = cmd.OutOrStdout().Write(md)
			return err
		}

		renderer, err := glamour.NewTermRenderer(
			glamour.WithAutoStyle(),
			glamour.WithWordWrap(100),
		)
		if err != nil {
			return fmt.Errorf("init markdown renderer: %w", err)
		}
		rendered, err := renderer.Render(string(md))
		if err != nil {
			_, _ = cmd.OutOrStdout().Write(md)
			return nil
		}
		fmt.Fprint(cmd.OutOrStdout(), rendered)
		return nil
	},
}

// resolveDocsPath turns user input into a docs path suitable for DocsRead.
// Accepts: a /path, a full elastic.co URL, or a free-text search query.
func resolveDocsPath(ctx context.Context, input string) (string, error) {
	if strings.HasPrefix(input, "https://www.elastic.co/docs") {
		return strings.TrimPrefix(input, "https://www.elastic.co"), nil
	}
	if strings.HasPrefix(input, "https://elastic.co/docs") {
		return strings.TrimPrefix(input, "https://elastic.co"), nil
	}

	if strings.HasPrefix(input, "/") {
		return input, nil
	}

	resp, _, err := client.DocsSearch(ctx, input, 1, 1)
	if err != nil {
		return "", fmt.Errorf("search for %q: %w", input, err)
	}
	if len(resp.Results) == 0 {
		return "", fmt.Errorf("no docs found for %q", input)
	}
	return resp.Results[0].URL, nil
}

func init() {
	docsCmd.AddCommand(docsReadCmd)

	docsReadCmd.Flags().BoolVar(&docsReadRaw, "raw", false, "Output unrendered markdown instead of formatted output")
}
