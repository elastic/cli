package cmd

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/output"

	"github.com/spf13/cobra"
)

var kbTaskManagerCmd = &cobra.Command{
	Use:   "task-manager",
	Short: "Task manager operations",
}

var kbTaskManagerHealthCmd = &cobra.Command{
	Use:          "health",
	Short:        "Get the task manager health",
	Args:         cobra.NoArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runKbTaskManagerHealth(cmd.Context(), cmd.OutOrStdout(), rootFormat)
	},
}

func init() {
	kbCmd.AddCommand(kbTaskManagerCmd)
	kbTaskManagerCmd.AddCommand(kbTaskManagerHealthCmd)
}

func runKbTaskManagerHealth(ctx context.Context, out io.Writer, format string) error {
	path, err := config.DefaultPath()
	if err != nil {
		return err
	}
	cfg, err := config.Load(path)
	if err != nil {
		return err
	}

	ctxName := strings.TrimSpace(rootContext)
	if ctxName == "" {
		ctxName = cfg.CurrentContext
	}
	if ctxName == "" {
		return fmt.Errorf("no context selected; run `elastic config context set <name> ...` and `elastic config context use <name>`")
	}

	ctxCfg, ok := cfg.Contexts[ctxName]
	if !ok {
		return fmt.Errorf("context %q not found; run `elastic config context list`", ctxName)
	}

	kb, err := client.NewKibanaFromContext(ctxCfg)
	if err != nil {
		return err
	}

	health, err := kb.TaskManagerHealth(ctx)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, health)
	}

	headers, rows := taskManagerHealthSummaryTable(health)
	return output.RenderRows(out, fmtFormat, headers, rows, nil)
}
