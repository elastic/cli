package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/cmdutil"
	"github.com/elastic/cli/internal/config"

	"go.yaml.in/yaml/v3"

	"github.com/spf13/cobra"
)

func newRawCmd(service string) *cobra.Command {
	var (
		method  string
		data    string
		headers []string
		query   []string
	)

	cmd := newCommand(commandSpec{
		Use:          "raw <path> [key=value...]",
		Short:        "Make a raw HTTP request",
		Args:         cobra.MinimumNArgs(1),
		SilenceUsage: true,
		NoDryRun:     true,
		RunE: func(cmd *cobra.Command, args []string) error {
			p := strings.TrimSpace(args[0])
			if p == "" {
				return errors.New("path is required")
			}

			pathOnly, qFromPath, err := splitPathAndQuery(p)
			if err != nil {
				return err
			}

			q := url.Values{}
			mergeQuery(q, qFromPath)
			for _, kv := range query {
				if err := addQueryKV(q, kv); err != nil {
					return err
				}
			}
			for _, kv := range args[1:] {
				if err := addQueryKV(q, kv); err != nil {
					return err
				}
			}

			h := http.Header{}
			for _, hv := range headers {
				k, v, err := splitHeaderKV(hv)
				if err != nil {
					return err
				}
				h.Add(k, v)
			}
			if data != "" && h.Get("Content-Type") == "" {
				h.Set("Content-Type", "application/json")
			}

			resolvedMethod := strings.ToUpper(strings.TrimSpace(method))
			if resolvedMethod == "" {
				resolvedMethod = http.MethodGet
			}

			// dry-run: emit resolved request shape and exit before any I/O
			if f := cmd.Flags().Lookup("dry-run"); f != nil && f.Value.String() == "true" {
				return renderRawDryRun(cmd, rootFormat, pathOnly, resolvedMethod, q, h, data)
			}

			cfgPath, err := config.DefaultPath()
			if err != nil {
				return err
			}
			ctxCfg, err := cmdutil.LookupContext(cfgPath, rootContext)
			if err != nil {
				return err
			}

			body := []byte(data)

			var resp client.RawResponse
			switch service {
			case "es", "elasticsearch":
				es, err := client.NewFromContext(ctxCfg)
				if err != nil {
					return err
				}
				resp, err = es.DoRaw(cmd.Context(), resolvedMethod, pathOnly, q, body, h)
				if err != nil {
					return err
				}
			case "kb", "kibana":
				kb, err := client.NewKibanaFromContext(ctxCfg)
				if err != nil {
					return err
				}
				resp, err = kb.DoRaw(cmd.Context(), resolvedMethod, pathOnly, q, body, h)
				if err != nil {
					return err
				}
			default:
				return fmt.Errorf("unknown service %q (try: es | kb)", service)
			}

			// output: raw body by default; parse JSON if format is json/yaml
			format := strings.ToLower(strings.TrimSpace(rootFormat))
			switch format {
			case "json":
				if err := prettyPrintJSON(cmd.OutOrStdout(), resp.Body); err == nil {
					break
				}
				_, _ = cmd.OutOrStdout().Write(append(resp.Body, '\n'))
			case "yaml":
				if err := printYAMLFromJSON(cmd.OutOrStdout(), resp.Body); err == nil {
					break
				}
				_, _ = cmd.OutOrStdout().Write(append(resp.Body, '\n'))
			default:
				_, _ = cmd.OutOrStdout().Write(append(resp.Body, '\n'))
			}

			if resp.StatusCode >= 400 {
				return fmt.Errorf("http error: %d", resp.StatusCode)
			}
			return nil
		},
	})

	cmd.Flags().Bool("dry-run", false, "Print resolved request and exit without executing")
	cmd.Flags().StringVarP(&method, "method", "X", "GET", "HTTP method")
	cmd.Flags().StringVarP(&data, "data", "d", "", "Request body (string). If set, Content-Type defaults to application/json unless overridden with -H.")
	cmd.Flags().StringArrayVarP(&headers, "header", "H", nil, "Header to add (repeatable), e.g. -H 'k:v'")
	cmd.Flags().StringArrayVarP(&query, "query", "q", nil, "Query param to add (repeatable), e.g. -q 'k=v'")

	return cmd
}

// renderRawDryRun writes the resolved request payload to cmd's stdout without
// making any network calls. Under --format=json it emits structured JSON;
// otherwise it prints a human-readable summary.
func renderRawDryRun(cmd *cobra.Command, format, path, method string, q url.Values, h http.Header, body string) error {
	format = strings.ToLower(strings.TrimSpace(format))
	if format == "json" {
		queryMap := map[string]string{}
		for k, vv := range q {
			queryMap[k] = strings.Join(vv, ",")
		}
		headerMap := map[string]string{}
		for k, vv := range h {
			headerMap[k] = strings.Join(vv, ",")
		}
		payload := struct {
			DryRun struct {
				Path    string            `json:"path"`
				Method  string            `json:"method"`
				Query   map[string]string `json:"query"`
				Headers map[string]string `json:"headers"`
				Body    string            `json:"body"`
			} `json:"dry_run"`
		}{}
		payload.DryRun.Path = path
		payload.DryRun.Method = method
		payload.DryRun.Query = queryMap
		payload.DryRun.Headers = headerMap
		payload.DryRun.Body = body
		b, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Fprintln(cmd.OutOrStdout(), string(b))
	} else {
		fmt.Fprintf(cmd.OutOrStdout(), "Dry run: %s %s\n", method, path)
		for k, vv := range q {
			fmt.Fprintf(cmd.OutOrStdout(), "  ?%s=%s\n", k, strings.Join(vv, ","))
		}
		for k, vv := range h {
			fmt.Fprintf(cmd.OutOrStdout(), "  %s: %s\n", k, strings.Join(vv, ","))
		}
		if body != "" {
			fmt.Fprintf(cmd.OutOrStdout(), "  body: %s\n", body)
		}
	}
	return nil
}

var esRawCmd = newRawCmd("es")
var kbRawCmd = newRawCmd("kb")

func init() {
	esCmd.AddCommand(esRawCmd)
	kbCmd.AddCommand(kbRawCmd)
}

func splitPathAndQuery(p string) (string, url.Values, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", nil, errors.New("path is empty")
	}
	// allow users to pass either a pure path, or a path+query like "/_search?q=..."
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
		u, err := url.Parse(p)
		if err != nil {
			return "", nil, fmt.Errorf("invalid url: %w", err)
		}
		return u.Path, u.Query(), nil
	}
	if !strings.Contains(p, "?") {
		return p, nil, nil
	}
	u, err := url.Parse(p)
	if err != nil {
		return "", nil, fmt.Errorf("invalid path/query: %w", err)
	}
	return u.Path, u.Query(), nil
}

func mergeQuery(dst url.Values, src url.Values) {
	if len(src) == 0 {
		return
	}
	for k, vv := range src {
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

func addQueryKV(q url.Values, kv string) error {
	kv = strings.TrimSpace(kv)
	if kv == "" {
		return nil
	}
	k, v, ok := strings.Cut(kv, "=")
	if !ok {
		return fmt.Errorf("invalid query param %q (expected key=value)", kv)
	}
	k = strings.TrimSpace(k)
	v = strings.TrimSpace(v)
	if k == "" {
		return fmt.Errorf("invalid query param %q (empty key)", kv)
	}
	q.Add(k, v)
	return nil
}

func splitHeaderKV(hv string) (string, string, error) {
	hv = strings.TrimSpace(hv)
	if hv == "" {
		return "", "", errors.New("header is empty")
	}
	k, v, ok := strings.Cut(hv, ":")
	if !ok {
		return "", "", fmt.Errorf("invalid header %q (expected k:v)", hv)
	}
	k = http.CanonicalHeaderKey(strings.TrimSpace(k))
	v = strings.TrimSpace(v)
	if k == "" {
		return "", "", fmt.Errorf("invalid header %q (empty key)", hv)
	}
	return k, v, nil
}

func prettyPrintJSON(w io.Writer, b []byte) error {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	out, err := json.MarshalIndent(v, "", " ")
	if err != nil {
		return err
	}
	_, err = w.Write(append(out, '\n'))
	return err
}

func printYAMLFromJSON(w io.Writer, b []byte) error {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	return yaml.NewEncoder(w).Encode(v)
}
