package cmd

import (
	"context"
	"io"
	"sort"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/cmdutil"
	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/output"
)

var esIndicesCmd = cmdutil.NewGroup("indices", "Index operations", "idx")

var esIndicesListCmd = cmdutil.NewContextCmd(cmdutil.ContextSpec{
	Use:     "list [name|pattern...]",
	Aliases: []string{"ls"},
	Short:   "List indices",
	Args:    cmdutil.ArgsAny,
	CtxFlag: func() string { return rootContext },
	Run: func(ctx context.Context, cmdCtx config.Context, args []string, out io.Writer, format string) error {
		return runListIndices(ctx, cmdCtx, out, args, format)
	},
})

var esDataStreamsCmd = cmdutil.NewGroup("data-streams", "Data stream operations", "ds")

var esDataStreamsListCmd = cmdutil.NewContextCmd(cmdutil.ContextSpec{
	Use:     "list [name|pattern...]",
	Aliases: []string{"ls"},
	Short:   "List data streams",
	Args:    cmdutil.ArgsAny,
	CtxFlag: func() string { return rootContext },
	Run: func(ctx context.Context, cmdCtx config.Context, args []string, out io.Writer, format string) error {
		return runListDataStreams(ctx, cmdCtx, out, args, format)
	},
})

var esRemoteClustersCmd = cmdutil.NewGroup("remote-clusters", "Remote cluster operations", "rc")

var esRemoteClustersListCmd = cmdutil.NewContextCmd(cmdutil.ContextSpec{
	Use:     "list [name|pattern...]",
	Aliases: []string{"ls"},
	Short:   "List remote clusters",
	Args:    cmdutil.ArgsAny,
	CtxFlag: func() string { return rootContext },
	Run: func(ctx context.Context, cmdCtx config.Context, args []string, out io.Writer, format string) error {
		return runListRemoteClusters(ctx, cmdCtx, out, args, format)
	},
})

var esClusterCmd = cmdutil.NewGroup("cluster", "Cluster operations")

var esClusterHealthCmd = cmdutil.NewContextCmd(cmdutil.ContextSpec{
	Use:     "health",
	Short:   "Get cluster health",
	Args:    cmdutil.ArgsNone,
	CtxFlag: func() string { return rootContext },
	Run: func(ctx context.Context, cmdCtx config.Context, args []string, out io.Writer, format string) error {
		return runClusterHealth(ctx, cmdCtx, out, format)
	},
})

func init() {
	esCmd.AddCommand(esIndicesCmd)
	esIndicesCmd.AddCommand(esIndicesListCmd)

	esCmd.AddCommand(esDataStreamsCmd)
	esDataStreamsCmd.AddCommand(esDataStreamsListCmd)

	esCmd.AddCommand(esRemoteClustersCmd)
	esRemoteClustersCmd.AddCommand(esRemoteClustersListCmd)

	esCmd.AddCommand(esClusterCmd)
	esClusterCmd.AddCommand(esClusterHealthCmd)
}

func runListIndices(ctx context.Context, cmdCtx config.Context, out io.Writer, patterns []string, format string) error {
	cl, err := client.NewFromContext(cmdCtx)
	if err != nil {
		return err
	}
	fmtFormat := output.NormalizeFormat(format)
	resolved, _, err := cl.ResolveIndex(ctx, joinPatterns(patterns))
	if err != nil {
		return err
	}
	return output.RenderRows(out, fmtFormat, indicesHeaders(), indicesRows(resolved.Indices), resolved.Indices)
}

func runListDataStreams(ctx context.Context, cmdCtx config.Context, out io.Writer, patterns []string, format string) error {
	cl, err := client.NewFromContext(cmdCtx)
	if err != nil {
		return err
	}
	fmtFormat := output.NormalizeFormat(format)
	resolved, _, err := cl.ResolveIndex(ctx, joinPatterns(patterns))
	if err != nil {
		return err
	}
	return output.RenderRows(out, fmtFormat, dataStreamsHeaders(), dataStreamsRows(resolved.DataStreams), resolved.DataStreams)
}

func runListRemoteClusters(ctx context.Context, cmdCtx config.Context, out io.Writer, patterns []string, format string) error {
	cl, err := client.NewFromContext(cmdCtx)
	if err != nil {
		return err
	}
	fmtFormat := output.NormalizeFormat(format)
	info, _, err := cl.RemoteInfo(ctx)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(info))
	for name := range info {
		if matchesAny(name, patterns) {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
		filtered := map[string]client.RemoteClusterInfo{}
		for _, name := range names {
			filtered[name] = info[name]
		}
		return output.RenderRows(out, fmtFormat, nil, nil, filtered)
	}
	return output.RenderRows(out, fmtFormat, remoteClustersHeaders(), remoteClustersRows(info, names), nil)
}

func runClusterHealth(ctx context.Context, cmdCtx config.Context, out io.Writer, format string) error {
	cl, err := client.NewFromContext(cmdCtx)
	if err != nil {
		return err
	}
	fmtFormat := output.NormalizeFormat(format)
	health, _, err := cl.ClusterHealth(ctx)
	if err != nil {
		return err
	}
	return output.RenderRows(out, fmtFormat, clusterHealthHeaders(), clusterHealthRows(health), health)
}
