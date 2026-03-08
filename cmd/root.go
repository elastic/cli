package cmd

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/telemetry"
	"github.com/spf13/cobra"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

var (
	rootContext string
	rootFormat  string
	rootOutput  string
	rootSpan    trace.Span
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

		spanCtx, span := telemetry.StartCommandSpan(
			telemetry.ExtractContextFromEnv(cmd.Context()),
			cmd.CommandPath(),
			rootContext,
			rootFormat,
			args,
		)
		rootSpan = span
		cmd.SetContext(spanCtx)

		path, err := config.DefaultPath()
		if err != nil {
			return err
		}
		_, err = config.EnsureInitialized(path)
		return err
	},
}

func Execute() {
	var otelYAML []byte
	if path, err := config.DefaultPath(); err == nil {
		if cfg, err := config.Load(path); err == nil {
			otelYAML, _ = cfg.OTelYAML()
		}
	}

	shutdown, err := telemetry.Init(context.Background(), otelYAML)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Warning: failed to init telemetry:", err)
	}
	defer func() {
		if rootSpan != nil {
			rootSpan.End()
		}
		if shutdown != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = shutdown(ctx)
		}
	}()

	if err := rootCmd.Execute(); err != nil {
		if rootSpan != nil {
			rootSpan.RecordError(err)
			rootSpan.SetStatus(codes.Error, strings.TrimSpace(err.Error()))
		}
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&rootContext, "context", "c", "", "Context name to use (overrides current-context)")
	rootCmd.PersistentFlags().StringVarP(&rootFormat, "format", "f", "table", "Output format: table|json|csv|yaml")
	rootCmd.PersistentFlags().StringVar(&rootOutput, "output", "", "Alias of --format (table|json|csv|yaml)")
}
