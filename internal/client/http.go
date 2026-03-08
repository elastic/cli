package client

import (
	"net/http"
	"time"

	"github.com/elastic/cli/internal/telemetry"
)

func newHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: telemetry.NewTransport(http.DefaultTransport),
	}
}
