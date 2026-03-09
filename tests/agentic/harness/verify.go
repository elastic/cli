package harness

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/jmespath/go-jmespath"
)

// RunVerifySteps executes each verification step against the elastic CLI and
// fails the test if any assertion is not satisfied. elasticBin is the path to
// the pre-built elastic binary.
func RunVerifySteps(t *testing.T, elasticBin string, env []string, steps []VerifyStep) {
	t.Helper()
	for i, step := range steps {
		t.Run(fmt.Sprintf("verify-%d", i), func(t *testing.T) {
			t.Helper()
			runVerifyStep(t, elasticBin, env, step)
		})
	}
}

func runVerifyStep(t *testing.T, elasticBin string, env []string, step VerifyStep) {
	t.Helper()

	args, err := shellSplit(step.Run)
	if err != nil {
		t.Fatalf("parse run command: %v", err)
	}
	if len(args) == 0 {
		t.Fatal("verify step has empty run command")
	}

	if args[0] == "elastic" {
		args[0] = elasticBin
	}

	cmd := exec.Command(args[0], args[1:]...)
	cmd.Env = appendEnv(env)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("verify command %q failed: %v\n%s", step.Run, err, string(out))
	}

	var data any
	if err := json.Unmarshal(out, &data); err != nil {
		t.Fatalf("verify command output is not valid JSON: %v\noutput: %s", err, string(out))
	}

	var extracted any
	if step.JMESPath != "" {
		extracted, err = jmespath.Search(step.JMESPath, data)
		if err != nil {
			t.Fatalf("jmespath %q failed: %v", step.JMESPath, err)
		}
	} else {
		extracted = data
	}

	checkAssertion(t, step, extracted, out)
}

func checkAssertion(t *testing.T, step VerifyStep, value any, cmdOutput []byte) {
	t.Helper()
	switch {
	case step.Assert == "not_empty":
		if value == nil {
			t.Fatalf("assertion not_empty failed: jmespath %q returned nil\nrun: %s\noutput:\n%s", step.JMESPath, step.Run, string(cmdOutput))
		}
		if s, ok := value.(string); ok && s == "" {
			t.Fatalf("assertion not_empty failed: jmespath %q returned empty string\nrun: %s\noutput:\n%s", step.JMESPath, step.Run, string(cmdOutput))
		}

	case strings.HasPrefix(step.Assert, "equals "):
		expected := strings.TrimPrefix(step.Assert, "equals ")
		actual := fmt.Sprintf("%v", value)
		if actual != expected {
			t.Fatalf("assertion equals failed: jmespath %q = %q, want %q\nrun: %s\noutput:\n%s", step.JMESPath, actual, expected, step.Run, string(cmdOutput))
		}

	default:
		t.Fatalf("unknown assertion %q", step.Assert)
	}
}

// shellSplit does a basic shell-style split that handles double-quoted tokens.
func shellSplit(s string) ([]string, error) {
	var args []string
	var current strings.Builder
	inQuote := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		switch {
		case ch == '"':
			inQuote = !inQuote
		case ch == ' ' && !inQuote:
			if current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
			}
		default:
			current.WriteByte(ch)
		}
	}
	if inQuote {
		return nil, fmt.Errorf("unclosed quote in %q", s)
	}
	if current.Len() > 0 {
		args = append(args, current.String())
	}
	return args, nil
}

func appendEnv(env []string) []string {
	return append(os.Environ(), env...)
}
