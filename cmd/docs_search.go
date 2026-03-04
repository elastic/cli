package cmd

import (
	"encoding/csv"
	"fmt"
	"strings"

	"github.com/charmbracelet/glamour"
	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/output"
	"github.com/spf13/cobra"
)

var (
	docsSearchPage int
	docsSearchSize int
	docsSearchCSV  bool
)

var docsSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search Elastic documentation",
	Long: `Search Elastic documentation using the docs search API.

Examples:
  elastic docs search "elasticsearch getting started"
  elastic docs search "ingest pipelines" --size 10
  elastic docs search "machine learning" --csv`,
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		resp, raw, err := client.DocsSearch(cmd.Context(), args[0], docsSearchPage, docsSearchSize)
		if err != nil {
			return err
		}

		format := output.NormalizeFormat(rootFormat)
		if format == output.FormatJSON || format == output.FormatYAML {
			return abOutputJSON(cmd.OutOrStdout(), raw)
		}

		if len(resp.Results) == 0 {
			fmt.Fprintln(cmd.OutOrStdout(), "No results found.")
			return nil
		}

		if docsSearchCSV {
			return docsSearchWriteCSV(cmd, resp)
		}

		return docsSearchWriteMarkdown(cmd, resp)
	},
}

func docsSearchWriteCSV(cmd *cobra.Command, resp *client.DocsSearchResponse) error {
	w := csv.NewWriter(cmd.OutOrStdout())
	defer w.Flush()
	_ = w.Write([]string{"title", "url", "description", "product", "related_products"})
	for _, r := range resp.Results {
		title := client.StripHTMLTags(r.Title)
		desc := docsResultSummary(r)
		url := "https://www.elastic.co" + r.URL
		product := ""
		if r.Product != nil {
			product = r.Product.DisplayName
		}
		related := docsRelatedProductNames(r, true)
		_ = w.Write([]string{title, url, desc, product, related})
	}
	return w.Error()
}

func docsSearchWriteMarkdown(cmd *cobra.Command, resp *client.DocsSearchResponse) error {
	var md strings.Builder
	for i, r := range resp.Results {
		title := client.StripHTMLTags(r.Title)
		summary := docsResultSummary(r)
		if len(summary) > 250 {
			summary = strings.TrimSpace(summary[:250]) + "..."
		}
		fullURL := "https://www.elastic.co" + r.URL

		fmt.Fprintf(&md, "# %s\n", title)

		productLine := docsProductLine(r)
		if productLine != "" {
			fmt.Fprintf(&md, "### %s\n", productLine)
		}

		fmt.Fprintf(&md, "%s\n\n", fullURL)
		fmt.Fprintf(&md, "%s\n", summary)

		if i < len(resp.Results)-1 {
			fmt.Fprintf(&md, "\n---\n\n")
		}
	}

	renderer, err := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(100),
	)
	if err != nil {
		_, _ = fmt.Fprint(cmd.OutOrStdout(), md.String())
		return nil
	}

	rendered, err := renderer.Render(md.String())
	if err != nil {
		_, _ = fmt.Fprint(cmd.OutOrStdout(), md.String())
		return nil
	}

	fmt.Fprint(cmd.OutOrStdout(), rendered)
	fmt.Fprintf(cmd.ErrOrStderr(), "Showing %d of %d results (page %d of %d)\n", len(resp.Results), resp.TotalResults, resp.PageNumber, resp.PageCount)
	return nil
}

// docsResultSummary returns aiShortSummary if available, otherwise the description.
func docsResultSummary(r client.DocsSearchResult) string {
	if r.AiShortSummary != nil && *r.AiShortSummary != "" {
		return *r.AiShortSummary
	}
	return client.StripHTMLTags(r.Description)
}

// docsProductLine builds a line like "Elasticsearch · Kibana, Machine Learning"
func docsProductLine(r client.DocsSearchResult) string {
	product := ""
	if r.Product != nil {
		product = r.Product.DisplayName
	}

	related := docsRelatedProductNames(r, false)
	if product == "" && related == "" {
		return ""
	}
	if related == "" || related == product {
		return product
	}
	if product == "" {
		return related
	}
	return product + " · " + related
}

// docsRelatedProductNames returns a comma-separated list of related product names,
// excluding the primary product to avoid duplication.
func docsRelatedProductNames(r client.DocsSearchResult, includePrimary bool) string {
	if len(r.RelatedProducts) == 0 {
		return ""
	}
	primaryID := ""
	if r.Product != nil {
		primaryID = r.Product.ID
	}
	var names []string
	for _, rp := range r.RelatedProducts {
		if !includePrimary && rp.ID == primaryID {
			continue
		}
		names = append(names, rp.DisplayName)
	}
	return strings.Join(names, ", ")
}

func init() {
	docsCmd.AddCommand(docsSearchCmd)

	docsSearchCmd.Flags().IntVar(&docsSearchPage, "page", 1, "Page number")
	docsSearchCmd.Flags().IntVar(&docsSearchSize, "size", 5, "Results per page")
	docsSearchCmd.Flags().BoolVar(&docsSearchCSV, "csv", false, "Output results as CSV")
}
