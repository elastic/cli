package cmd

import (
	"context"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/output"
)

// runGet is shared listing logic used by noun-first resource commands.
func runGet(ctx context.Context, out io.Writer, resource string, patterns []string, format string) error {
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

	kind, err := normalizeGetResource(resource)
	if err != nil {
		return err
	}

	fmtFormat := output.NormalizeFormat(format)
	if fmtFormat == output.FormatCSV && kind == "all" {
		return fmt.Errorf("format %q requires a specific resource (indices or data-streams), or use -f table", fmtFormat)
	}

	if kind == "slos" {
		kb, err := client.NewKibanaFromContext(ctxCfg)
		if err != nil {
			return err
		}

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

	if kind == "slo-definitions" {
		kb, err := client.NewKibanaFromContext(ctxCfg)
		if err != nil {
			return err
		}

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

	cl, err := client.NewFromContext(ctxCfg)
	if err != nil {
		return err
	}

	if kind == "remote-clusters" {
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

		// For JSON/YAML, return a stable, filtered map.
		if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
			filtered := map[string]client.RemoteClusterInfo{}
			for _, name := range names {
				filtered[name] = info[name]
			}
			return output.RenderRows(out, fmtFormat, nil, nil, filtered)
		}

		return output.RenderRows(out, fmtFormat, remoteClustersHeaders(), remoteClustersRows(info, names), nil)
	}

	if kind == "cluster-health" {
		health, _, err := cl.ClusterHealth(ctx)
		if err != nil {
			return err
		}
		return output.RenderRows(out, fmtFormat, clusterHealthHeaders(), clusterHealthRows(health), health)
	}

	pattern := "*"
	if len(patterns) > 0 {
		trimmed := make([]string, 0, len(patterns))
		for _, p := range patterns {
			p = strings.TrimSpace(p)
			if p != "" {
				trimmed = append(trimmed, p)
			}
		}
		if len(trimmed) > 0 {
			// Elasticsearch supports comma-separated names/patterns.
			pattern = strings.Join(trimmed, ",")
		}
	}

	resolved, _, err := cl.ResolveIndex(ctx, pattern)
	if err != nil {
		return err
	}

	switch kind {
	case "indices":
		return output.RenderRows(out, fmtFormat, indicesHeaders(), indicesRows(resolved.Indices), resolved.Indices)
	case "data-streams":
		return output.RenderRows(out, fmtFormat, dataStreamsHeaders(), dataStreamsRows(resolved.DataStreams), resolved.DataStreams)
	case "all":
		if fmtFormat == output.FormatJSON || fmtFormat == output.FormatYAML {
			return output.RenderRows(out, fmtFormat, nil, nil, resolved)
		}
		fmt.Fprintln(out, "Indices")
		if err := output.RenderRows(out, fmtFormat, indicesHeaders(), indicesRows(resolved.Indices), nil); err != nil {
			return err
		}
		fmt.Fprintln(out)
		fmt.Fprintln(out, "Data streams")
		return output.RenderRows(out, fmtFormat, dataStreamsHeaders(), dataStreamsRows(resolved.DataStreams), nil)
	default:
		return fmt.Errorf("unexpected resource: %s", kind)
	}
}

func normalizeGetResource(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "", "all":
		return "all", nil
	case "indices", "index", "idx":
		return "indices", nil
	case "data-streams", "datastreams", "data_streams", "ds", "data-stream":
		return "data-streams", nil
	case "remote-clusters", "remoteclusters", "remote", "rc":
		return "remote-clusters", nil
	case "cluster-health", "clusterhealth", "cluster", "health":
		return "cluster-health", nil
	case "slos", "slo":
		return "slos", nil
	case "slo-definitions", "slo-definition", "slo-defs", "slo-def":
		return "slo-definitions", nil
	default:
		return "", fmt.Errorf("unknown resource %q (try: indices | data-streams | remote-clusters | cluster-health | slos | slo-definitions | all)", s)
	}
}

func matchesAny(name string, patterns []string) bool {
	// No patterns means "all".
	if len(patterns) == 0 {
		return true
	}
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// Exact match fast path.
		if name == p {
			return true
		}
		// Support kubectl-like globbing with * and ?.
		if ok, _ := path.Match(p, name); ok {
			return true
		}
	}
	return false
}
