package cmd

import (
	"strings"

	"github.com/elastic/cli/internal/client"
)

func indicesHeaders() []string {
	return []string{"name", "attributes"}
}

func indicesRows(indices []client.ResolveIndexItem) [][]any {
	rows := make([][]any, 0, len(indices))
	for _, idx := range indices {
		rows = append(rows, []any{
			idx.Name,
			strings.Join(idx.Attributes, ","),
		})
	}
	return rows
}

func dataStreamsHeaders() []string {
	return []string{"name", "backing_indices"}
}

func dataStreamsRows(streams []client.ResolveDataStream) [][]any {
	rows := make([][]any, 0, len(streams))
	for _, ds := range streams {
		rows = append(rows, []any{
			ds.Name,
			len(ds.BackingIndices),
		})
	}
	return rows
}

func remoteClustersHeaders() []string {
	return []string{"name", "connected", "mode", "nodes", "seeds_or_proxy", "skip_unavailable"}
}

func remoteClustersRows(in map[string]client.RemoteClusterInfo, names []string) [][]any {
	rows := make([][]any, 0, len(names))
	for _, name := range names {
		info, ok := in[name]
		if !ok {
			continue
		}
		target := info.ProxyAddress
		if target == "" {
			target = strings.Join(info.Seeds, ",")
		}
		rows = append(rows, []any{
			name,
			info.Connected,
			info.Mode,
			info.NumNodesConnected,
			target,
			info.SkipUnavailable,
		})
	}
	return rows
}

func clusterHealthHeaders() []string {
	return []string{"cluster_name", "status", "number_of_nodes", "active_shards"}
}

func clusterHealthRows(in client.ClusterHealth) [][]any {
	return [][]any{{
		in.ClusterName,
		in.Status,
		in.NumberOfNodes,
		in.ActiveShards,
	}}
}
