package client

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const abBasePath = "/api/agent_builder"

func abPath(space, rest string) string {
	if space != "" {
		return "/s/" + url.PathEscape(space) + abBasePath + rest
	}
	return abBasePath + rest
}

// --- Agents ---

func (c *KibanaClient) ListAgents(ctx context.Context, space string) ([]byte, error) {
	return c.get(ctx, abPath(space, "/agents"), nil)
}

func (c *KibanaClient) GetAgent(ctx context.Context, space, id string) ([]byte, error) {
	return c.get(ctx, abPath(space, "/agents/"+url.PathEscape(id)), nil)
}

func (c *KibanaClient) CreateAgent(ctx context.Context, space string, body []byte) ([]byte, error) {
	return c.postJSON(ctx, abPath(space, "/agents"), body)
}

func (c *KibanaClient) UpdateAgent(ctx context.Context, space, id string, body []byte) ([]byte, error) {
	return c.putJSON(ctx, abPath(space, "/agents/"+url.PathEscape(id)), body)
}

func (c *KibanaClient) DeleteAgent(ctx context.Context, space, id string) ([]byte, error) {
	return c.doDelete(ctx, abPath(space, "/agents/"+url.PathEscape(id)))
}

// --- Tools ---

func (c *KibanaClient) ListTools(ctx context.Context, space string) ([]byte, error) {
	return c.get(ctx, abPath(space, "/tools"), nil)
}

func (c *KibanaClient) GetTool(ctx context.Context, space, id string) ([]byte, error) {
	return c.get(ctx, abPath(space, "/tools/"+url.PathEscape(id)), nil)
}

func (c *KibanaClient) CreateTool(ctx context.Context, space string, body []byte) ([]byte, error) {
	return c.postJSON(ctx, abPath(space, "/tools"), body)
}

func (c *KibanaClient) UpdateTool(ctx context.Context, space, id string, body []byte) ([]byte, error) {
	return c.putJSON(ctx, abPath(space, "/tools/"+url.PathEscape(id)), body)
}

func (c *KibanaClient) DeleteTool(ctx context.Context, space, id string) ([]byte, error) {
	return c.doDelete(ctx, abPath(space, "/tools/"+url.PathEscape(id)))
}

func (c *KibanaClient) ExecuteTool(ctx context.Context, space string, body []byte) ([]byte, error) {
	return c.postJSON(ctx, abPath(space, "/tools/_execute"), body)
}

// --- Conversations ---

func (c *KibanaClient) ListConversations(ctx context.Context, space string) ([]byte, error) {
	return c.get(ctx, abPath(space, "/conversations"), nil)
}

func (c *KibanaClient) GetConversation(ctx context.Context, space, id string) ([]byte, error) {
	return c.get(ctx, abPath(space, "/conversations/"+url.PathEscape(id)), nil)
}

func (c *KibanaClient) DeleteConversation(ctx context.Context, space, id string) ([]byte, error) {
	return c.doDelete(ctx, abPath(space, "/conversations/"+url.PathEscape(id)))
}

// --- Chat ---

// Converse sends a synchronous chat message to an agent.
// It uses a longer timeout than other endpoints because LLM inference can be slow.
func (c *KibanaClient) Converse(ctx context.Context, space string, body []byte) ([]byte, error) {
	return c.doMutateLong(ctx, http.MethodPost, abPath(space, "/converse"), body)
}

// --- HTTP helpers ---

func (c *KibanaClient) postJSON(ctx context.Context, p string, body []byte) ([]byte, error) {
	return c.doMutate(ctx, http.MethodPost, p, body)
}

func (c *KibanaClient) putJSON(ctx context.Context, p string, body []byte) ([]byte, error) {
	return c.doMutate(ctx, http.MethodPut, p, body)
}

func (c *KibanaClient) doDelete(ctx context.Context, p string) ([]byte, error) {
	return c.doMutate(ctx, http.MethodDelete, p, nil)
}

func (c *KibanaClient) doMutate(ctx context.Context, method, p string, body []byte) ([]byte, error) {
	return c.doMutateWith(ctx, c.http, method, p, body)
}

// doMutateLong is like doMutate but uses a 5-minute timeout suitable for LLM calls.
func (c *KibanaClient) doMutateLong(ctx context.Context, method, p string, body []byte) ([]byte, error) {
	hc := newHTTPClient(5 * time.Minute)
	return c.doMutateWith(ctx, hc, method, p, body)
}

func (c *KibanaClient) doMutateWith(ctx context.Context, hc *http.Client, method, p string, body []byte) ([]byte, error) {
	u := c.baseURL + p

	var r io.Reader
	if len(body) > 0 {
		r = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, r)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "ApiKey "+c.apiKey)
	req.Header.Set("kbn-xsrf", "elastic")
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := hc.Do(req)
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
		return b, fmt.Errorf("kibana error (%s): %s", resp.Status, msg)
	}
	return b, nil
}
