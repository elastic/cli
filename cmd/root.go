package cmd

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/telemetry"
	"github.com/spf13/cobra"
	"go.opentelemetry.io/otel/attribute"
)

var (
	rootContext string
	rootFormat  string
	rootOutput  string
)

const rootBanner = "" +
	"  ╔═╗╦  ╔═╗╔═╗╔╦╗╦╔═╗\n" +
	"  ║╣ ║  ╠═╣╚═╗ ║ ║║  \n" +
	"  ╚═╝╩═╝╩ ╩╚═╝ ╩ ╩╚═╝\n"

var rootCmd = &cobra.Command{
	Use:   "elastic",
	Short: "elastic is the CLI for Elastic.",
	Long:  "elastic is the CLI for Elastic.",
	RunE: func(cmd *cobra.Command, args []string) error {
		_, _ = fmt.Fprint(cmd.OutOrStdout(), rootBanner+"\n")
		return cmd.Help()
	},
	// We print errors ourselves in Execute(); avoid Cobra printing them twice.
	SilenceErrors: true,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Support an alias flag name: --output behaves like --format.
		if rootOutput != "" && rootFormat == "table" {
			rootFormat = rootOutput
		}

		// Avoid creating files for help/completion plumbing.
		switch cmd.Name() {
		case "help", "completion", "__complete":
			return nil
		}

		path, err := config.DefaultPath()
		if err != nil {
			return err
		}
		_, err = config.EnsureInitialized(path)
		if err != nil {
			return err
		}
		spanAttrs := []attribute.KeyValue{
			attribute.String("command.path", cmd.CommandPath()),
			attribute.String("output.format", strings.ToLower(strings.TrimSpace(rootFormat))),
		}
		if rootContext != "" {
			spanAttrs = append(spanAttrs, attribute.String("context.name", rootContext))
		}
		cmd.SetContext(telemetry.StartCommandSpan(cmd.Context(), cmd.CommandPath(), spanAttrs...))
		return nil
	},
}

func Execute() {
	baseCtx := telemetry.ExtractContextFromEnvironment(context.Background())
	shutdown, err := telemetry.Init(baseCtx)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Warning: OpenTelemetry disabled:", err)
	}
	if shutdown != nil {
		defer func() {
			if shutdownErr := shutdown(context.Background()); shutdownErr != nil {
				fmt.Fprintln(os.Stderr, "Warning: OpenTelemetry shutdown failed:", shutdownErr)
			}
		}()
	}
	rootCmd.SetContext(baseCtx)
	cmd, err := rootCmd.ExecuteC()
	if cmd != nil {
		telemetry.EndCommandSpan(cmd.Context(), err)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&rootContext, "context", "c", "", "Context name to use (overrides current-context)")
	rootCmd.PersistentFlags().StringVarP(&rootFormat, "format", "f", "table", "Output format: table|json|csv|yaml")
	rootCmd.PersistentFlags().StringVar(&rootOutput, "output", "", "Alias of --format (table|json|csv|yaml)")
}
