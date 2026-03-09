package agentic_test

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/elastic/cli/tests/agentic/harness"
)

func TestCopilotScenarios(t *testing.T) {
	if os.Getenv("ELASTIC_AGENTIC_TESTS") != "1" {
		t.Skip("set ELASTIC_AGENTIC_TESTS=1 to enable agentic scenario tests")
	}
	copilotCLI := os.Getenv("ELASTIC_AGENTIC_COPILOT_CLI")
	if copilotCLI == "" {
		copilotCLI = "copilot"
	}
	if _, err := exec.LookPath(copilotCLI); err != nil {
		t.Fatalf("copilot CLI %q not in PATH", copilotCLI)
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

	// Build the elastic CLI binary so Copilot (and verify steps) use it
	// directly instead of "go run", which would require source access.
	binDir := t.TempDir()
	elasticBin := filepath.Join(binDir, "elastic-bin")
	buildCmd := exec.Command("go", "build", "-o", elasticBin, "./cmd/elastic")
	buildCmd.Dir = repoRoot
	buildCmd.Env = os.Environ()
	if out, err := buildCmd.CombinedOutput(); err != nil {
		t.Fatalf("go build elastic: %v\n%s", err, string(out))
	}

	// Write a wrapper script that sets XDG_CONFIG_HOME before exec'ing the
	// real binary. This keeps the config override scoped to the elastic CLI
	// so the Copilot CLI's own config/auth is unaffected.
	tempHome := t.TempDir()
	xdgConfigHome := filepath.Join(tempHome, ".config")
	wrapper := filepath.Join(binDir, "elastic")
	script := fmt.Sprintf("#!/bin/sh\nexport XDG_CONFIG_HOME=%q\nexec %q \"$@\"\n", xdgConfigHome, elasticBin)
	if err := os.WriteFile(wrapper, []byte(script), 0o755); err != nil {
		t.Fatalf("write elastic wrapper: %v", err)
	}

	env := []string{"XDG_CONFIG_HOME=" + xdgConfigHome}
	runElastic(t, elasticBin, env, "config", "context", "set", "local",
		"--elasticsearch-url", "http://localhost:9200",
		"--kibana-url", "http://localhost:5601",
		"--username", "elastic",
		"--password", elasticPassword,
	)
	waitForElasticCommand(t, elasticBin, env, 3*time.Minute, "es", "cluster", "health", "-f", "json")
	waitForElasticCommand(t, elasticBin, env, 3*time.Minute, "kb", "raw", "/api/status", "-f", "json")

	scenarioDir := filepath.Join(repoRoot, "tests", "agentic", "scenarios")
	scenarioFiles, err := filepath.Glob(filepath.Join(scenarioDir, "*.md"))
	if err != nil {
		t.Fatalf("glob scenarios: %v", err)
	}
	if len(scenarioFiles) == 0 {
		t.Fatal("no scenario files found in tests/agentic/scenarios/")
	}

	artifactDir := os.Getenv("ELASTIC_AGENTIC_ARTIFACTS_DIR")
	if artifactDir == "" {
		artifactDir = t.TempDir()
	}
	if err := os.MkdirAll(artifactDir, 0o700); err != nil {
		t.Fatalf("mkdir artifacts: %v", err)
	}

	// Copilot runs in an isolated sandbox directory with only the elastic
	// binary on PATH, preventing access to the repository source code.
	sandboxDir := t.TempDir()
	sandboxEnv := append(os.Environ(), "PATH="+binDir+string(filepath.ListSeparator)+os.Getenv("PATH"))
	for _, scenarioPath := range scenarioFiles {
		name := strings.TrimSuffix(filepath.Base(scenarioPath), ".md")
		t.Run(name, func(t *testing.T) {
			copilotOpts := &harness.CopilotOptions{
				CLIPath:    copilotCLI,
				WorkingDir: sandboxDir,
				Env:        sandboxEnv,
				EventLog: func(msg string) {
					fmt.Fprintln(t.Output(), msg)
				},
			}
			scenario, err := harness.LoadScenario(scenarioPath)
			if err != nil {
				t.Fatalf("load scenario: %v", err)
			}

			uniqueID := fmt.Sprintf("agentic-%s-%d", name, time.Now().UnixNano())
			vars := map[string]string{"unique_id": uniqueID}

			prompt := harness.RenderPrompt(scenario, vars)
			promptPath := filepath.Join(artifactDir, name+"-prompt.md")
			transcriptPath := filepath.Join(artifactDir, name+"-transcript.json")
			if err := os.WriteFile(promptPath, []byte(prompt), 0o600); err != nil {
				t.Fatalf("write prompt: %v", err)
			}

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
			defer cancel()
			if err := harness.RunCopilot(ctx, prompt, transcriptPath, copilotOpts); err != nil {
				t.Fatalf("run copilot: %v", err)
			}

			steps := harness.RenderVerifySteps(scenario, vars)
			if len(steps) == 0 {
				t.Log("no verify steps defined; skipping verification")
				return
			}
			harness.RunVerifySteps(t, elasticBin, env, steps)
		})
	}
}

func runElastic(t *testing.T, elasticBin string, env []string, args ...string) string {
	t.Helper()
	cmd := exec.Command(elasticBin, args...)
	cmd.Env = append(os.Environ(), env...)
	b, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("elastic command failed (%v): %v\n%s", args, err, string(b))
	}
	return string(b)
}

func runElasticMaybe(elasticBin string, env []string, args ...string) (string, error) {
	cmd := exec.Command(elasticBin, args...)
	cmd.Env = append(os.Environ(), env...)
	b, err := cmd.CombinedOutput()
	return string(b), err
}

func waitForElasticCommand(t *testing.T, elasticBin string, env []string, timeout time.Duration, args ...string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	for {
		out, err := runElasticMaybe(elasticBin, env, args...)
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
