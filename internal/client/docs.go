package client

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const docsBaseURL = "https://www.elastic.co/docs"
const docsCookie = "feature_search_or_askai_enabled=true"

type DocsSearchResult struct {
	Type              string            `json:"type"`
	URL               string            `json:"url"`
	Title             string            `json:"title"`
	Description       string            `json:"description"`
	AiShortSummary    *string           `json:"aiShortSummary"`
	Score             float64           `json:"score"`
	NavigationSection string            `json:"navigationSection"`
	LastUpdated       string            `json:"lastUpdated"`
	Product           *DocsProduct      `json:"product,omitempty"`
	RelatedProducts   []DocsProduct     `json:"relatedProducts,omitempty"`
	Parents           []DocsSearchCrumb `json:"parents,omitempty"`
}

type DocsProduct struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

type DocsSearchCrumb struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

type DocsSearchResponse struct {
	Results      []DocsSearchResult `json:"results"`
	TotalResults int                `json:"totalResults"`
	PageNumber   int                `json:"pageNumber"`
	PageSize     int                `json:"pageSize"`
	PageCount    int                `json:"pageCount"`
}

// DocsSearch calls the Elastic docs search API.
func DocsSearch(ctx context.Context, query string, page, size int) (*DocsSearchResponse, []byte, error) {
	q := url.Values{}
	q.Set("q", query)
	q.Set("page", fmt.Sprint(page))
	q.Set("size", fmt.Sprint(size))
	q.Set("sort", "relevance")

	u := docsBaseURL + "/_api/v1/search?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.AddCookie(&http.Cookie{Name: "feature_search_or_askai_enabled", Value: "true"})

	hc := &http.Client{Timeout: 30 * time.Second}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("docs search request failed: %w", err)
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(b))
		if msg == "" {
			msg = resp.Status
		}
		return nil, b, fmt.Errorf("docs search error (%s): %s", resp.Status, msg)
	}

	var out DocsSearchResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, b, fmt.Errorf("parse docs search response: %w", err)
	}
	return &out, b, nil
}

// DocsRead fetches a docs page as markdown. The path should be relative
// (e.g. "/docs/reference/elasticsearch") — .md is appended automatically.
func DocsRead(ctx context.Context, path string) ([]byte, error) {
	path = strings.TrimSuffix(path, ".md")
	u := docsBaseURL
	if strings.HasPrefix(path, "/docs") {
		u = "https://www.elastic.co" + path + ".md"
	} else if strings.HasPrefix(path, "/") {
		u = docsBaseURL + path + ".md"
	} else {
		u = docsBaseURL + "/" + path + ".md"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	hc := &http.Client{Timeout: 30 * time.Second}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docs read request failed: %w", err)
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("docs read error (%s) for %s", resp.Status, u)
	}
	return b, nil
}

// SSEEvent represents a single Server-Sent Event.
type SSEEvent struct {
	Event string
	Data  string
	ID    string
}

// DocsAskStream sends a question to the docs AI assistant and streams SSE events.
// The caller receives events on the returned channel; the channel is closed when
// the stream ends. Errors are reported via the error channel (buffered, at most 1).
// The conversationID is always sent (generated client-side by the caller).
func DocsAskStream(ctx context.Context, message string, conversationID string) (<-chan SSEEvent, <-chan error) {
	events := make(chan SSEEvent, 64)
	errc := make(chan error, 1)

	go func() {
		defer close(events)
		defer close(errc)

		body := map[string]any{
			"message":        message,
			"conversationId": conversationID,
		}

		b, err := json.Marshal(body)
		if err != nil {
			errc <- fmt.Errorf("marshal request: %w", err)
			return
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, docsBaseURL+"/_api/v1/ask-ai/stream", bytes.NewReader(b))
		if err != nil {
			errc <- fmt.Errorf("create request: %w", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")
		req.AddCookie(&http.Cookie{Name: "feature_search_or_askai_enabled", Value: "true"})

		hc := &http.Client{Timeout: 5 * time.Minute}
		resp, err := hc.Do(req)
		if err != nil {
			errc <- fmt.Errorf("docs ask request failed: %w", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			rb, _ := io.ReadAll(resp.Body)
			msg := strings.TrimSpace(string(rb))
			if msg == "" {
				msg = resp.Status
			}
			errc <- fmt.Errorf("docs ask error (%s): %s", resp.Status, msg)
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		var event SSEEvent
		for scanner.Scan() {
			line := scanner.Text()

			if line == "" {
				if event.Data != "" || event.Event != "" {
					events <- event
					event = SSEEvent{}
				}
				continue
			}

			if strings.HasPrefix(line, "event:") {
				event.Event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			} else if strings.HasPrefix(line, "data:") {
				raw := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
				if event.Data != "" {
					event.Data += "\n" + raw
				} else {
					event.Data = raw
				}
			} else if strings.HasPrefix(line, "id:") {
				event.ID = strings.TrimSpace(strings.TrimPrefix(line, "id:"))
			}
		}
		// Flush any trailing event without a final blank line.
		if event.Data != "" || event.Event != "" {
			events <- event
		}
		if err := scanner.Err(); err != nil {
			errc <- fmt.Errorf("read SSE stream: %w", err)
		}
	}()

	return events, errc
}

// StripHTMLTags removes simple HTML tags like <mark> from a string.
func StripHTMLTags(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	return b.String()
}
