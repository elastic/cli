package cmd

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elastic/cli/internal/config"
)

func TestRunGetIndicesJSON(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if r.Method != http.MethodGet {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if r.URL.Path != "/_resolve/index/logs-*" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("expand_wildcards") != "all" {
			t.Fatalf("unexpected query: %s", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(`{"indices":[{"name":"logs-2026.02.20","attributes":["open"]}]}`))
	}))
	defer srv.Close()

	writeTestConfig(t, config.Config{
		CurrentContext: "test",
		Contexts: map[string]config.Context{
			"test": {
				ElasticsearchURL: srv.URL,
				APIKey:           "test-key",
			},
		},
	})

	rootContext = ""
	var out bytes.Buffer
	if err := runGet(&out, "indices", []string{"logs-*"}, "json"); err != nil {
		t.Fatalf("runGet returned error: %v", err)
	}

	if gotAuth != "ApiKey test-key" {
		t.Fatalf("unexpected auth header: %q", gotAuth)
	}
	if !strings.Contains(out.String(), `"name": "logs-2026.02.20"`) {
		t.Fatalf("expected index name in output, got: %s", out.String())
	}
}

func TestESQueryCmdJSONOmitsNullColumns(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if r.URL.Path != "/_query" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{
			"columns":[{"name":"a","type":"integer"},{"name":"b","type":"keyword"}],
			"values":[[1,null]]
		}`))
	}))
	defer srv.Close()

	writeTestConfig(t, config.Config{
		CurrentContext: "test",
		Contexts: map[string]config.Context{
			"test": {
				ElasticsearchURL: srv.URL,
				APIKey:           "test-key",
			},
		},
	})

	prevFormat, prevContext, prevNull := rootFormat, rootContext, esqlShowNull
	t.Cleanup(func() {
		rootFormat, rootContext, esqlShowNull = prevFormat, prevContext, prevNull
	})
	rootFormat = "json"
	rootContext = ""
	esqlShowNull = false

	var out bytes.Buffer
	esQueryCmd.SetOut(&out)
	if err := esQueryCmd.RunE(esQueryCmd, []string{"FROM logs-* | LIMIT 1"}); err != nil {
		t.Fatalf("es query returned error: %v", err)
	}

	got := out.String()
	if strings.Contains(got, `"name": "b"`) {
		t.Fatalf("expected null-only column to be omitted, got: %s", got)
	}
	if !strings.Contains(got, `"name": "a"`) {
		t.Fatalf("expected non-null column in output, got: %s", got)
	}
}

func TestRawCmdKibanaHTTPErrorReturnsBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("kbn-xsrf") == "" {
			t.Fatal("expected kbn-xsrf header")
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"missing"}`))
	}))
	defer srv.Close()

	writeTestConfig(t, config.Config{
		CurrentContext: "test",
		Contexts: map[string]config.Context{
			"test": {
				KibanaURL: srv.URL,
				APIKey:    "test-key",
			},
		},
	})

	prevFormat, prevContext := rootFormat, rootContext
	prevMethod, prevData, prevHeaders, prevQuery := apiMethod, apiData, apiHeaders, apiQuery
	t.Cleanup(func() {
		rootFormat, rootContext = prevFormat, prevContext
		apiMethod, apiData, apiHeaders, apiQuery = prevMethod, prevData, prevHeaders, prevQuery
	})

	rootFormat = ""
	rootContext = ""
	apiMethod = "GET"
	apiData = ""
	apiHeaders = nil
	apiQuery = nil

	rawCmd := newRawCmd("kb")
	var out bytes.Buffer
	rawCmd.SetOut(&out)
	err := rawCmd.RunE(rawCmd, []string{"/api/does-not-exist"})
	if err == nil || !strings.Contains(err.Error(), "http error: 404") {
		t.Fatalf("expected HTTP 404 error, got: %v", err)
	}
	if !strings.Contains(out.String(), `{"error":"missing"}`) {
		t.Fatalf("expected raw body to be written, got: %s", out.String())
	}
}

func writeTestConfig(t *testing.T, cfg config.Config) {
	t.Helper()

	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	path, err := config.DefaultPath()
	if err != nil {
		t.Fatalf("DefaultPath error: %v", err)
	}
	if err := config.Save(path, cfg); err != nil {
		t.Fatalf("Save config error: %v", err)
	}
}
