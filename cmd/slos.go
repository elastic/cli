package cmd

import (
	"context"
	"io"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/cmdutil"
	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/output"
)

var slosCmd = cmdutil.NewGroup("slos", "SLO operations")

var slosListCmd = cmdutil.NewContextCmd(cmdutil.ContextSpec{
	Use:     "list [name|pattern...]",
	Aliases: []string{"ls"},
	Short:   "List SLOs",
	Args:    cmdutil.ArgsAny,
	CtxFlag: func() string { return rootContext },
	Run: func(ctx context.Context, cmdCtx config.Context, args []string, out io.Writer, format string) error {
		return runListSLOs(ctx, cmdCtx, out, args, format)
	},
})

var slosListDefinitionsCmd = cmdutil.NewContextCmd(cmdutil.ContextSpec{
	Use:     "list-definitions [name|pattern...]",
	Short:   "List SLO definitions",
	Args:    cmdutil.ArgsAny,
	CtxFlag: func() string { return rootContext },
	Run: func(ctx context.Context, cmdCtx config.Context, args []string, out io.Writer, format string) error {
		return runListSLODefinitions(ctx, cmdCtx, out, args, format)
	},
})

func init() {
	rootCmd.AddCommand(slosCmd)
	slosCmd.AddCommand(slosListCmd)
	slosCmd.AddCommand(slosListDefinitionsCmd)
}

func runListSLOs(ctx context.Context, cmdCtx config.Context, out io.Writer, patterns []string, format string) error {
	kb, err := client.NewKibanaFromContext(cmdCtx)
	if err != nil {
		return err
	}
	fmtFormat := output.NormalizeFormat(format)
	slos, err := kb.ListSLOs(ctx)
	if err != nil {
		return err
	}
	filtered := filterSLOs(slos, patterns)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, filtered)
	}
	return output.RenderRows(out, fmtFormat, slosHeaders(), slosRows(filtered), filtered)
}

func runListSLODefinitions(ctx context.Context, cmdCtx config.Context, out io.Writer, patterns []string, format string) error {
	kb, err := client.NewKibanaFromContext(cmdCtx)
	if err != nil {
		return err
	}
	fmtFormat := output.NormalizeFormat(format)
	defs, err := kb.ListSLODefinitions(ctx)
	if err != nil {
		return err
	}
	filtered := filterSLODefinitions(defs, patterns)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		return output.RenderRows(out, fmtFormat, nil, nil, filtered)
	}
	return output.RenderRows(out, fmtFormat, sloDefinitionsHeaders(), sloDefinitionsRows(filtered), filtered)
}
