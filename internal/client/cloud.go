package client

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/elastic/cli/internal/config"
)

const DefaultCloudURL = "https://api.elastic-cloud.com"

type CloudClient struct {
	baseURL    string
	authHeader string
	http       *http.Client
}

func NewCloudFromContext(ctx config.Context, cloudURL string) (*CloudClient, error) {
	baseURL := strings.TrimSpace(cloudURL)
	if baseURL == "" {
		baseURL = DefaultCloudURL
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid cloud url: %w", err)
	}
	if u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("invalid cloud url (must include scheme and host): %q", baseURL)
	}

	authHeader, err := authorizationHeaderFromContext(ctx)
	if err != nil {
		return nil, err
	}

	return &CloudClient{
		baseURL:    strings.TrimRight(baseURL, "/"),
		authHeader: authHeader,
		http:       newHTTPClient(30 * time.Second),
	}, nil
}

func (c *CloudClient) ListServerlessProjects(ctx context.Context, projectType string) (RawResponse, error) {
	return c.doRaw(ctx, http.MethodGet, "/api/v1/serverless/projects/"+url.PathEscape(projectType), nil, nil, nil)
}

func (c *CloudClient) GetServerlessProject(ctx context.Context, projectType, id string) (RawResponse, error) {
	p := "/api/v1/serverless/projects/" + url.PathEscape(projectType) + "/" + url.PathEscape(id)
	return c.doRaw(ctx, http.MethodGet, p, nil, nil, nil)
}

func (c *CloudClient) CreateServerlessProject(ctx context.Context, projectType string, body []byte) (RawResponse, error) {
	p := "/api/v1/serverless/projects/" + url.PathEscape(projectType)
	headers := http.Header{}
	if len(body) > 0 {
		headers.Set("Content-Type", "application/json")
	}
	return c.doRaw(ctx, http.MethodPost, p, nil, body, headers)
}

func (c *CloudClient) UpdateServerlessProject(ctx context.Context, projectType, id string, body []byte) (RawResponse, error) {
	p := "/api/v1/serverless/projects/" + url.PathEscape(projectType) + "/" + url.PathEscape(id)
	headers := http.Header{}
	if len(body) > 0 {
		headers.Set("Content-Type", "application/json")
	}
	return c.doRaw(ctx, http.MethodPatch, p, nil, body, headers)
}

func (c *CloudClient) DeleteServerlessProject(ctx context.Context, projectType, id string) (RawResponse, error) {
	p := "/api/v1/serverless/projects/" + url.PathEscape(projectType) + "/" + url.PathEscape(id)
	return c.doRaw(ctx, http.MethodDelete, p, nil, nil, nil)
}

func (c *CloudClient) doRaw(ctx context.Context, method, p string, q url.Values, body []byte, headers http.Header) (RawResponse, error) {
	return doRaw(ctx, c.http, c.baseURL, c.authHeader, false, method, p, q, body, headers)
}
