//go:build agentic

package agentic_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/elastic/cli/tests/agentic/harness"
)

func TestCopilotScenarioDashboardCreate(t *testing.T) {
	if os.Getenv("ELASTIC_AGENTIC_TESTS") != "1" {
		t.Skip("set ELASTIC_AGENTIC_TESTS=1 to enable agentic scenario tests")
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
	composeFile := filepath.Join(repoRoot, "tests", "functional", "docker-compose.yml")
	projectName := fmt.Sprintf("elastic-cli-agentic-%d", time.Now().UnixNano())
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
	env := []string{"XDG_CONFIG_HOME=" + filepath.Join(tempHome, ".config")}
	runElastic(t, repoRoot, env, "config", "context", "set", "local",
		"--elasticsearch-url", "http://localhost:9200",
		"--kibana-url", "http://localhost:5601",
		"--username", "elastic",
		"--password", elasticPassword,
	)
	waitForElasticCommand(t, repoRoot, env, 3*time.Minute, "es", "cluster", "health", "-f", "json")
	waitForElasticCommand(t, repoRoot, env, 3*time.Minute, "kb", "raw", "/api/status", "-f", "json")

	scenarioPath := filepath.Join(repoRoot, "tests", "agentic", "scenarios", "dashboard-create.md")
	scenario, err := harness.LoadScenario(scenarioPath)
	if err != nil {
		t.Fatalf("load scenario: %v", err)
	}

	dashboardTitle := fmt.Sprintf("agentic-dashboard-%d", time.Now().UnixNano())
	prompt := harness.RenderPrompt(scenario, dashboardTitle)
	artifactDir := os.Getenv("ELASTIC_AGENTIC_ARTIFACTS_DIR")
	if artifactDir == "" {
		artifactDir = t.TempDir()
	}
	if err := os.MkdirAll(artifactDir, 0o700); err != nil {
		t.Fatalf("mkdir artifacts: %v", err)
	}
	promptPath := filepath.Join(artifactDir, "prompt.md")
	transcriptPath := filepath.Join(artifactDir, "copilot-transcript.txt")
	if err := os.WriteFile(promptPath, []byte(prompt), 0o600); err != nil {
		t.Fatalf("write prompt: %v", err)
	}

	copilotCommand := os.Getenv("ELASTIC_AGENTIC_COPILOT_CMD")
	if copilotCommand == "" {
		t.Skip("set ELASTIC_AGENTIC_COPILOT_CMD to a Copilot CLI command that consumes ELASTIC_AGENTIC_PROMPT_FILE")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	if err := harness.RunCopilot(ctx, repoRoot, copilotCommand, promptPath, transcriptPath); err != nil {
		t.Fatalf("run copilot harness: %v", err)
	}

	listOut := runElastic(t, repoRoot, env, "kb", "dashboard", "list", dashboardTitle, "-f", "json")
	var list map[string]any
	if err := json.Unmarshal([]byte(listOut), &list); err != nil {
		t.Fatalf("parse dashboard list JSON output: %v\noutput: %s", err, listOut)
	}
	dashboards, _ := list["dashboards"].([]any)
	if len(dashboards) == 0 {
		t.Fatalf("no dashboards found for title %q", dashboardTitle)
	}
	var dashboardID string
	for _, entry := range dashboards {
		m, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		title, _ := m["title"].(string)
		if title != dashboardTitle {
			continue
		}
		dashboardID, _ = m["id"].(string)
		if dashboardID != "" {
			break
		}
	}
	if dashboardID == "" {
		t.Fatalf("dashboard with exact title %q and non-empty id not found", dashboardTitle)
	}

	getOut := runElastic(t, repoRoot, env, "kb", "dashboard", "get", dashboardID, "-f", "json")
	var dashboard map[string]any
	if err := json.Unmarshal([]byte(getOut), &dashboard); err != nil {
		t.Fatalf("parse dashboard get JSON output: %v\noutput: %s", err, getOut)
	}
	title, _ := dashboard["title"].(string)
	if title != dashboardTitle {
		t.Fatalf("dashboard title = %q, want %q", title, dashboardTitle)
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

func runElasticMaybe(repoRoot string, env []string, args ...string) (string, error) {
	cmd := exec.Command("go", append([]string{"run", "./cmd/elastic"}, args...)...)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), env...)
	b, err := cmd.CombinedOutput()
	return string(b), err
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
