//go:build functional

package functional_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestElasticCLIWithDockerComposeStack(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping functional test in short mode")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not available")
	}
	if err := exec.Command("docker", "compose", "version").Run(); err != nil {
		t.Skip("docker compose not available")
	}

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	repoRoot := filepath.Clean(filepath.Join(wd, "..", ".."))
	composeFile := filepath.Join(wd, "docker-compose.yml")
	projectName := fmt.Sprintf("elastic-cli-functional-%d", time.Now().UnixNano())

	runCmd(t, repoRoot, nil, "docker", "compose", "-p", projectName, "-f", composeFile, "up", "-d")
	t.Cleanup(func() {
		_ = exec.Command("docker", "compose", "-p", projectName, "-f", composeFile, "down", "-v").Run()
	})

	waitForHTTP(t, "http://localhost:9200", 3*time.Minute)
	waitForKibanaStatus(t, "http://localhost:5601/api/status", 3*time.Minute)

	tempHome := t.TempDir()
	env := []string{
		"XDG_CONFIG_HOME=" + filepath.Join(tempHome, ".config"),
	}

	runElastic(t, repoRoot, env, "config", "context", "set", "local",
		"--elasticsearch-url", "http://localhost:9200",
		"--kibana-url", "http://localhost:5601",
		"--api-key", "functional-test-key",
	)

	indicesOut := runElastic(t, repoRoot, env, "es", "indices", "list", "-f", "json")
	var indices []map[string]any
	if err := json.Unmarshal([]byte(indicesOut), &indices); err != nil {
		t.Fatalf("parse indices JSON output: %v\noutput: %s", err, indicesOut)
	}

	statusOut := runElastic(t, repoRoot, env, "kb", "raw", "/api/status", "-f", "json")
	var status map[string]any
	if err := json.Unmarshal([]byte(statusOut), &status); err != nil {
		t.Fatalf("parse kibana status JSON output: %v\noutput: %s", err, statusOut)
	}
}

func runElastic(t *testing.T, repoRoot string, env []string, args ...string) string {
	t.Helper()
	cmd := exec.Command("go", append([]string{"run", "./cmd/elastic"}, args...)...)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), env...)
	b, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("elastic command failed (%v): %v\n%s", args, err, string(b))
	}
	return string(b)
}

func runCmd(t *testing.T, dir string, env []string, name string, args ...string) string {
	t.Helper()
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), env...)
	b, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s %v failed: %v\n%s", name, args, err, string(b))
	}
	return string(b)
}

func waitForHTTP(t *testing.T, u string, timeout time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	client := &http.Client{Timeout: 5 * time.Second}
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			t.Fatalf("create request for %s: %v", u, err)
		}
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				return
			}
		}
		if ctx.Err() != nil {
			t.Fatalf("timed out waiting for %s: %v", u, ctx.Err())
		}
		time.Sleep(2 * time.Second)
	}
}

func waitForKibanaStatus(t *testing.T, u string, timeout time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	client := &http.Client{Timeout: 5 * time.Second}
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			t.Fatalf("create request for %s: %v", u, err)
		}
		req.Header.Set("kbn-xsrf", "elastic")
		resp, err := client.Do(req)
		if err == nil {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode < 400 && strings.Contains(strings.ToLower(string(b)), "available") {
				return
			}
		}
		if ctx.Err() != nil {
			t.Fatalf("timed out waiting for %s: %v", u, ctx.Err())
		}
		time.Sleep(2 * time.Second)
	}
}
