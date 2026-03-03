package client

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// RawResponse is a raw HTTP response.
// Body is always populated when the request reaches the server, even for 4xx/5xx.
type RawResponse struct {
	StatusCode int
	Header     http.Header
	Body       []byte
}

func (c *Client) DoRaw(ctx context.Context, method, p string, q url.Values, body []byte, headers http.Header) (RawResponse, error) {
	return doRaw(ctx, c.http, c.baseURL, c.authHeader, false, method, p, q, body, headers)
}

func (c *KibanaClient) DoRaw(ctx context.Context, method, p string, q url.Values, body []byte, headers http.Header) (RawResponse, error) {
	return doRaw(ctx, c.http, c.baseURL, c.authHeader, true, method, p, q, body, headers)
}

func doRaw(ctx context.Context, hc *http.Client, baseURL, authHeader string, isKibana bool, method, p string, q url.Values, body []byte, headers http.Header) (RawResponse, error) {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = http.MethodGet
	}
	p = strings.TrimSpace(p)
	if p == "" {
		return RawResponse{}, fmt.Errorf("path is required")
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}

	u := baseURL + p
	if len(q) > 0 {
		u += "?" + q.Encode()
	}

	var r io.Reader
	if len(body) > 0 {
		r = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, r)
	if err != nil {
		return RawResponse{}, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", authHeader)
	if isKibana {
		req.Header.Set("kbn-xsrf", "elastic")
	}
	if headers != nil {
		for k, vv := range headers {
			for _, v := range vv {
				req.Header.Add(k, v)
			}
		}
	}

	resp, err := hc.Do(req)
	if err != nil {
		return RawResponse{}, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return RawResponse{}, fmt.Errorf("read response: %w", err)
	}

	return RawResponse{
		StatusCode: resp.StatusCode,
		Header:     resp.Header.Clone(),
		Body:       b,
	}, nil
}
