package client

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/elastic/cli/internal/config"
)

type Client struct {
	baseURL    string
	authHeader string
	http       *http.Client
}

type ResolveIndexItem struct {
	Name       string   `json:"name"`
	Attributes []string `json:"attributes,omitempty"`
}

type ResolveDataStream struct {
	Name           string   `json:"name"`
	BackingIndices []string `json:"backing_indices,omitempty"`
	TimestampField string   `json:"timestamp_field,omitempty"`
}

type ResolveIndexResponse struct {
	Indices     []ResolveIndexItem  `json:"indices,omitempty"`
	DataStreams []ResolveDataStream `json:"data_streams,omitempty"`
}

type RemoteClusterInfo struct {
	Connected             bool     `json:"connected"`
	Mode                  string   `json:"mode,omitempty"`
	Seeds                 []string `json:"seeds,omitempty"`
	ProxyAddress          string   `json:"proxy_address,omitempty"`
	NumNodesConnected     int      `json:"num_nodes_connected,omitempty"`
	InitialConnectTimeout string   `json:"initial_connect_timeout,omitempty"`
	SkipUnavailable       bool     `json:"skip_unavailable,omitempty"`
}

type ClusterHealth struct {
	ClusterName   string `json:"cluster_name,omitempty"`
	Status        string `json:"status,omitempty"`
	NumberOfNodes int    `json:"number_of_nodes,omitempty"`
	ActiveShards  int    `json:"active_shards,omitempty"`
}

type CatIndex struct {
	Health    string `json:"health"`
	Status    string `json:"status"`
	Index     string `json:"index"`
	DocsCount string `json:"docs.count"`
	StoreSize string `json:"store.size"`
}

type DataStreamIndex struct {
	IndexName string `json:"index_name"`
}

type DataStream struct {
	Name       string            `json:"name"`
	Status     string            `json:"status,omitempty"`
	Generation int               `json:"generation,omitempty"`
	Indices    []DataStreamIndex `json:"indices,omitempty"`
	Template   string            `json:"template,omitempty"`
}

type DataStreamsResponse struct {
	DataStreams []DataStream `json:"data_streams,omitempty"`
}

type ESQLColumn struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type ESQLResponse struct {
	ID        string       `json:"id,omitempty"`
	IsRunning bool         `json:"is_running,omitempty"`
	Took      int          `json:"took,omitempty"`
	IsPartial bool         `json:"is_partial,omitempty"`
	Columns   []ESQLColumn `json:"columns,omitempty"`
	Values    [][]any      `json:"values,omitempty"`
}

type ESQLQueryRequest struct {
	Query string `json:"query"`
}

func (c *Client) SetTimeout(timeout time.Duration) {
	if timeout <= 0 {
		return
	}
	c.http.Timeout = timeout
}

func NewFromContext(ctx config.Context) (*Client, error) {
	baseURL := strings.TrimSpace(ctx.ElasticsearchURL)
	if baseURL == "" {
		if strings.TrimSpace(ctx.CloudID) == "" {
			return nil, errors.New("context must set either elasticsearch_url or cloud_id")
		}
		u, err := elasticsearchURLFromCloudID(ctx.CloudID)
		if err != nil {
			return nil, err
		}
		baseURL = u
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid elasticsearch url: %w", err)
	}
	if u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("invalid elasticsearch url (must include scheme and host): %q", baseURL)
	}
	authHeader, err := authorizationHeaderFromContext(ctx)
	if err != nil {
		return nil, err
	}

	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		authHeader: authHeader,
		http:       newHTTPClient(30 * time.Second),
	}, nil
}

func (c *Client) ESQLQuery(ctx context.Context, query string) (ESQLResponse, []byte, error) {
	body, err := json.Marshal(ESQLQueryRequest{Query: query})
	if err != nil {
		return ESQLResponse{}, nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/_query", bytes.NewReader(body))
	if err != nil {
		return ESQLResponse{}, nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", c.authHeader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return ESQLResponse{}, nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return ESQLResponse{}, nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(b))
		if msg == "" {
			msg = resp.Status
		}
		return ESQLResponse{}, b, fmt.Errorf("elasticsearch error (%s): %s", resp.Status, msg)
	}

	var out ESQLResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return ESQLResponse{}, b, fmt.Errorf("parse response: %w", err)
	}
	return out, b, nil
}

func (c *Client) ResolveIndex(ctx context.Context, pattern string) (ResolveIndexResponse, []byte, error) {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		pattern = "*"
	}

	q := url.Values{}
	q.Set("expand_wildcards", "all")

	b, err := c.get(ctx, "/_resolve/index/"+url.PathEscape(pattern), q)
	if err != nil {
		return ResolveIndexResponse{}, nil, err
	}

	var out ResolveIndexResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return ResolveIndexResponse{}, b, fmt.Errorf("parse resolve index response: %w", err)
	}
	return out, b, nil
}

func (c *Client) RemoteInfo(ctx context.Context) (map[string]RemoteClusterInfo, []byte, error) {
	b, err := c.get(ctx, "/_remote/info", nil)
	if err != nil {
		return nil, nil, err
	}

	var out map[string]RemoteClusterInfo
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, b, fmt.Errorf("parse remote info response: %w", err)
	}
	if out == nil {
		out = map[string]RemoteClusterInfo{}
	}
	return out, b, nil
}

func (c *Client) ClusterHealth(ctx context.Context) (ClusterHealth, []byte, error) {
	b, err := c.get(ctx, "/_cluster/health", nil)
	if err != nil {
		return ClusterHealth{}, nil, err
	}

	var out ClusterHealth
	if err := json.Unmarshal(b, &out); err != nil {
		return ClusterHealth{}, b, fmt.Errorf("parse cluster health response: %w", err)
	}
	return out, b, nil
}

func (c *Client) CatIndices(ctx context.Context) ([]CatIndex, []byte, error) {
	q := url.Values{}
	q.Set("format", "json")
	q.Set("bytes", "b")
	q.Set("s", "index")
	q.Set("expand_wildcards", "all")
	// Keep the output stable by choosing columns explicitly.
	q.Set("h", "health,status,index,docs.count,store.size")

	b, err := c.get(ctx, "/_cat/indices", q)
	if err != nil {
		return nil, nil, err
	}

	var out []CatIndex
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, b, fmt.Errorf("parse indices response: %w", err)
	}
	return out, b, nil
}

func (c *Client) DataStreams(ctx context.Context) ([]DataStream, []byte, error) {
	q := url.Values{}
	q.Set("expand_wildcards", "all")

	b, err := c.get(ctx, "/_data_stream", q)
	if err != nil {
		return nil, nil, err
	}

	var resp DataStreamsResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, b, fmt.Errorf("parse data streams response: %w", err)
	}
	return resp.DataStreams, b, nil
}

func (c *Client) get(ctx context.Context, path string, q url.Values) ([]byte, error) {
	u := c.baseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", c.authHeader)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(b))
		if msg == "" {
			msg = resp.Status
		}
		return b, fmt.Errorf("elasticsearch error (%s): %s", resp.Status, msg)
	}
	return b, nil
}

func elasticsearchURLFromCloudID(cloudID string) (string, error) {
	cloudID = strings.TrimSpace(cloudID)
	if cloudID == "" {
		return "", errors.New("cloud_id is empty")
	}

	// cloud_id is "<label>:<base64(domain$es$kibana)>"
	parts := strings.SplitN(cloudID, ":", 2)
	payload := cloudID
	if len(parts) == 2 {
		payload = parts[1]
	}

	decoded, err := decodeBase64String(payload)
	if err != nil {
		return "", fmt.Errorf("decode cloud_id: %w", err)
	}

	segments := strings.Split(decoded, "$")
	if len(segments) < 2 {
		return "", fmt.Errorf("unexpected cloud_id payload: %q", decoded)
	}
	domain := segments[0]
	esID := segments[1]
	if domain == "" || esID == "" {
		return "", fmt.Errorf("unexpected cloud_id payload: %q", decoded)
	}

	// Elastic Cloud uses :443 for Elasticsearch via the Cloud ID URL.
	return fmt.Sprintf("https://%s.%s:443", esID, domain), nil
}

func decodeBase64String(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", errors.New("base64 payload empty")
	}

	// Try raw (no padding) first, then standard (with padding).
	if b, err := base64.RawStdEncoding.DecodeString(s); err == nil {
		return string(b), nil
	}
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
