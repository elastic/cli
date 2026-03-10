//go:build functional

package functional_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
	elasticPassword := fmt.Sprintf("elastic-%d", time.Now().UnixNano())
	kibanaPassword := fmt.Sprintf("kibana-%d", time.Now().UnixNano())
	composeEnv := []string{
		"ELASTIC_PASSWORD=" + elasticPassword,
		"KIBANA_PASSWORD=" + kibanaPassword,
	}

	runCmd(t, repoRoot, composeEnv, "docker", "compose", "-p", projectName, "-f", composeFile, "up", "-d")
	t.Cleanup(func() {
		cmd := exec.Command("docker", "compose", "-p", projectName, "-f", composeFile, "down", "-v")
		cmd.Env = append(os.Environ(), composeEnv...)
		_ = cmd.Run()
	})

	tempHome := t.TempDir()
	env := []string{
		"XDG_CONFIG_HOME=" + filepath.Join(tempHome, ".config"),
	}

	runElastic(t, repoRoot, env, "config", "context", "set", "local",
		"--elasticsearch-url", "http://localhost:9200",
		"--kibana-url", "http://localhost:5601",
		"--username", "elastic",
		"--password", elasticPassword,
	)
	waitForElasticCommand(t, repoRoot, env, 3*time.Minute, "es", "cluster", "health", "-f", "json")
	statusOut := waitForElasticCommand(t, repoRoot, env, 3*time.Minute, "kb", "raw", "/api/status", "-f", "json")

	indicesOut := runElastic(t, repoRoot, env, "es", "indices", "list", "-f", "json")
	var indices []map[string]any
	if err := json.Unmarshal([]byte(indicesOut), &indices); err != nil {
		t.Fatalf("parse indices JSON output: %v\noutput: %s", err, indicesOut)
	}

	var status map[string]any
	if err := json.Unmarshal([]byte(statusOut), &status); err != nil {
		t.Fatalf("parse kibana status JSON output: %v\noutput: %s", err, statusOut)
	}

	_ = runElastic(t, repoRoot, env, "kb", "lens", "schema", "-f", "json")
	lensTitle := fmt.Sprintf("functional-lens-%d", time.Now().UnixNano())
	createOut := runElastic(t, repoRoot, env, "kb", "lens", "create", "--title", lensTitle, "-f", "json")

	var createdLens map[string]any
	if err := json.Unmarshal([]byte(createOut), &createdLens); err != nil {
		t.Fatalf("parse lens create output: %v\noutput: %s", err, createOut)
	}
	lensID, _ := createdLens["id"].(string)
	if lensID == "" {
		t.Fatalf("lens create output missing id: %s", createOut)
	}
	t.Cleanup(func() {
		_, _ = runElasticMaybe(repoRoot, env, "kb", "lens", "delete", lensID)
	})

	listOut := runElastic(t, repoRoot, env, "kb", "lens", "list", lensTitle, "-f", "json")
	var listed map[string]any
	if err := json.Unmarshal([]byte(listOut), &listed); err != nil {
		t.Fatalf("parse lens list output: %v\noutput: %s", err, listOut)
	}
	items, _ := listed["items"].([]any)
	found := false
	for _, item := range items {
		entry, _ := item.(map[string]any)
		if id, _ := entry["id"].(string); id == lensID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("lens %q not found in lens list output: %s", lensID, listOut)
	}

	getOut := runElastic(t, repoRoot, env, "kb", "lens", "get", lensID, "-f", "json")
	var gotLens map[string]any
	if err := json.Unmarshal([]byte(getOut), &gotLens); err != nil {
		t.Fatalf("parse lens get output: %v\noutput: %s", err, getOut)
	}
	if gotID, _ := gotLens["id"].(string); gotID != lensID {
		t.Fatalf("unexpected lens id from get output: got %q want %q", gotID, lensID)
	}

	_ = runElastic(t, repoRoot, env, "kb", "lens", "delete", lensID)
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

func waitForElasticCommand(t *testing.T, repoRoot string, env []string, timeout time.Duration, args ...string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	for {
		out, err := runElasticMaybe(repoRoot, env, args...)
		if err == nil {
			return out
		}
		if ctx.Err() != nil {
			t.Fatalf("timed out waiting for elastic command (%v): %v", args, ctx.Err())
		}
		time.Sleep(2 * time.Second)
	}
}

func runElasticMaybe(repoRoot string, env []string, args ...string) (string, error) {
	cmd := exec.Command("go", append([]string{"run", "./cmd/elastic"}, args...)...)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), env...)
	b, err := cmd.CombinedOutput()
	return string(b), err
}
