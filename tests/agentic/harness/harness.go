package harness

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type Scenario struct {
	Objective       string
	SuccessCriteria []string
}

func LoadScenario(path string) (*Scenario, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read scenario: %w", err)
	}
	text := string(b)
	objective, err := markdownSection(text, "objective")
	if err != nil {
		return nil, err
	}
	criteriaRaw, err := markdownSection(text, "success_criteria")
	if err != nil {
		return nil, err
	}
	lines := strings.Split(criteriaRaw, "\n")
	criteria := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "- ") {
			criteria = append(criteria, strings.TrimSpace(strings.TrimPrefix(line, "- ")))
		}
	}
	if len(criteria) == 0 {
		return nil, fmt.Errorf("scenario %q has no success criteria", path)
	}
	return &Scenario{Objective: objective, SuccessCriteria: criteria}, nil
}

func RenderPrompt(s *Scenario, dashboardTitle string) string {
	replacer := strings.NewReplacer("{{dashboard_title}}", dashboardTitle)
	objective := replacer.Replace(s.Objective)
	criteria := make([]string, 0, len(s.SuccessCriteria))
	for _, c := range s.SuccessCriteria {
		criteria = append(criteria, replacer.Replace(c))
	}
	return strings.TrimSpace(fmt.Sprintf(
		"Objective:\n%s\n\nDo this only by running local shell commands in this repository.\n\nSuccess criteria to satisfy:\n- %s\n",
		objective, strings.Join(criteria, "\n- "),
	))
}

func RunCopilot(ctx context.Context, repoRoot, copilotCommand, promptPath, transcriptPath string) error {
	if strings.TrimSpace(copilotCommand) == "" {
		return fmt.Errorf("ELASTIC_AGENTIC_COPILOT_CMD is required")
	}
	cmd := exec.CommandContext(ctx, "sh", "-c", copilotCommand)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), "ELASTIC_AGENTIC_PROMPT_FILE="+promptPath)
	out, err := cmd.CombinedOutput()
	if writeErr := os.WriteFile(transcriptPath, out, 0o600); writeErr != nil {
		return fmt.Errorf("write transcript: %w", writeErr)
	}
	if err != nil {
		return fmt.Errorf("run copilot command: %w", err)
	}
	return nil
}

func markdownSection(text, heading string) (string, error) {
	lines := strings.Split(text, "\n")
	needle := "# " + heading
	start := -1
	for i := range lines {
		if strings.EqualFold(strings.TrimSpace(lines[i]), needle) {
			start = i + 1
			break
		}
	}
	if start == -1 {
		return "", fmt.Errorf("missing section %q", heading)
	}
	end := len(lines)
	for i := start; i < len(lines); i++ {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "# ") {
			end = i
			break
		}
	}
	section := strings.TrimSpace(strings.Join(lines[start:end], "\n"))
	if section == "" {
		return "", fmt.Errorf("empty section %q", heading)
	}
	return section, nil
}
