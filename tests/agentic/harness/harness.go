package harness

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	copilot "github.com/github/copilot-sdk/go"
)

// VerifyStep is a declarative verification command parsed from a scenario's
// # verify section. Fields contain raw template variables (e.g. {{unique_id}}).
type VerifyStep struct {
	Run      string // elastic CLI command to execute
	JMESPath string // JMESPath expression to extract a value from JSON output
	Assert   string // assertion: "not_empty" or "equals <value>"
}

type Scenario struct {
	Objective       string
	SuccessCriteria []string
	VerifySteps     []VerifyStep
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

	verifyRaw, err := markdownSection(text, "verify")
	if err != nil {
		// verify section is optional
		return &Scenario{Objective: objective, SuccessCriteria: criteria}, nil
	}
	steps, err := parseVerifySteps(verifyRaw)
	if err != nil {
		return nil, fmt.Errorf("scenario %q: %w", path, err)
	}

	return &Scenario{Objective: objective, SuccessCriteria: criteria, VerifySteps: steps}, nil
}

// parseVerifySteps extracts VerifyStep entries from fenced ```verify blocks.
func parseVerifySteps(raw string) ([]VerifyStep, error) {
	var steps []VerifyStep
	lines := strings.Split(raw, "\n")
	inBlock := false
	var blockLines []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !inBlock && (trimmed == "```verify" || trimmed == "``` verify") {
			inBlock = true
			blockLines = nil
			continue
		}
		if inBlock && trimmed == "```" {
			inBlock = false
			step, err := parseVerifyBlock(blockLines)
			if err != nil {
				return nil, err
			}
			steps = append(steps, step)
			continue
		}
		if inBlock {
			blockLines = append(blockLines, line)
		}
	}
	if inBlock {
		return nil, fmt.Errorf("unclosed ```verify block")
	}
	return steps, nil
}

func parseVerifyBlock(lines []string) (VerifyStep, error) {
	var s VerifyStep
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			return s, fmt.Errorf("invalid verify line (expected key: value): %q", line)
		}
		val = strings.TrimSpace(val)
		switch strings.TrimSpace(key) {
		case "run":
			s.Run = val
		case "jmespath":
			s.JMESPath = strings.Trim(val, `"`)
		case "assert":
			s.Assert = val
		default:
			return s, fmt.Errorf("unknown verify key %q", key)
		}
	}
	if s.Run == "" {
		return s, fmt.Errorf("verify block missing required 'run' field")
	}
	if s.Assert == "" {
		return s, fmt.Errorf("verify block missing required 'assert' field")
	}
	return s, nil
}

// RenderPrompt substitutes template variables into the scenario objective and
// success criteria, producing the prompt text sent to Copilot.
func RenderPrompt(s *Scenario, vars map[string]string) string {
	replacer := varsReplacer(vars)
	objective := replacer.Replace(s.Objective)
	criteria := make([]string, 0, len(s.SuccessCriteria))
	for _, c := range s.SuccessCriteria {
		criteria = append(criteria, replacer.Replace(c))
	}
	return strings.TrimSpace(fmt.Sprintf(
		"Objective:\n%s\n\nDo this only by running the `elastic` CLI, which is available on your PATH.\nDo not attempt to read, modify, or browse any source code.\n\nSuccess criteria to satisfy:\n- %s\n",
		objective, strings.Join(criteria, "\n- "),
	))
}

// RenderVerifySteps returns a copy of the scenario's verify steps with all
// template variables substituted.
func RenderVerifySteps(s *Scenario, vars map[string]string) []VerifyStep {
	replacer := varsReplacer(vars)
	out := make([]VerifyStep, len(s.VerifySteps))
	for i, step := range s.VerifySteps {
		out[i] = VerifyStep{
			Run:      replacer.Replace(step.Run),
			JMESPath: replacer.Replace(step.JMESPath),
			Assert:   replacer.Replace(step.Assert),
		}
	}
	return out
}

func varsReplacer(vars map[string]string) *strings.Replacer {
	pairs := make([]string, 0, len(vars)*2)
	for k, v := range vars {
		pairs = append(pairs, "{{"+k+"}}", v)
	}
	return strings.NewReplacer(pairs...)
}

// CopilotOptions configures the Copilot SDK client for RunCopilot.
type CopilotOptions struct {
	// CLIPath overrides the path to the Copilot CLI executable.
	// Empty means use the SDK default ("copilot").
	CLIPath string
	// WorkingDir is an isolated directory used as the Copilot session's
	// working directory. This prevents Copilot from accessing source code.
	WorkingDir string
	// Env sets environment variables for the Copilot CLI process
	// (e.g. PATH containing the pre-built elastic binary).
	Env []string
	// EventLog, if non-nil, is called for each session event with a
	// human-readable log line. Use with testing.T.Log for -v output.
	EventLog func(string)
}

// RunCopilot creates a Copilot SDK session in an isolated working directory,
// sends prompt as a message, and writes the full event transcript to
// transcriptPath.
func RunCopilot(ctx context.Context, prompt, transcriptPath string, opts *CopilotOptions) error {
	clientOpts := &copilot.ClientOptions{
		Cwd: opts.WorkingDir,
		Env: opts.Env,
	}
	if opts.CLIPath != "" {
		clientOpts.CLIPath = opts.CLIPath
	}

	client := copilot.NewClient(clientOpts)
	if err := client.Start(ctx); err != nil {
		return fmt.Errorf("start copilot client: %w", err)
	}
	defer client.Stop()

	session, err := client.CreateSession(ctx, &copilot.SessionConfig{
		WorkingDirectory:    opts.WorkingDir,
		OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
	})
	if err != nil {
		return fmt.Errorf("create copilot session: %w", err)
	}
	defer session.Disconnect()

	var events []copilot.SessionEvent
	unsubscribe := session.On(func(event copilot.SessionEvent) {
		events = append(events, event)
		if opts.EventLog != nil {
			if msg := formatEvent(event); msg != "" {
				opts.EventLog(msg)
			}
		}
	})
	defer unsubscribe()

	reply, err := session.SendAndWait(ctx, copilot.MessageOptions{Prompt: prompt})
	if err != nil {
		writeTranscript(transcriptPath, events)
		return fmt.Errorf("copilot session: %w", err)
	}
	if reply != nil {
		events = append(events, *reply)
	}

	if err := writeTranscript(transcriptPath, events); err != nil {
		return err
	}
	return nil
}

func formatEvent(e copilot.SessionEvent) string {
	switch e.Type {
	case copilot.AssistantReasoning:
		if s := ptrStr(e.Data.Content); s != "" {
			return "[reasoning] " + s
		}
		if s := ptrStr(e.Data.ReasoningText); s != "" {
			return "[reasoning] " + s
		}
	case copilot.AssistantMessage:
		if s := ptrStr(e.Data.Content); s != "" {
			return "[assistant] " + s
		}
	case copilot.AssistantIntent:
		if s := ptrStr(e.Data.Intent); s != "" {
			return "[intent] " + s
		}
	case copilot.ToolExecutionStart:
		name := ptrStr(e.Data.ToolName)
		args := formatArgs(e.Data.Arguments)
		if name != "" {
			return fmt.Sprintf("[tool.start] %s %s", name, args)
		}
	case copilot.ToolExecutionComplete:
		name := ptrStr(e.Data.ToolName)
		ok := e.Data.Success != nil && *e.Data.Success
		if name != "" {
			return fmt.Sprintf("[tool.done] %s success=%v", name, ok)
		}
	}
	return ""
}

func ptrStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func formatArgs(v interface{}) string {
	if v == nil {
		return ""
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

func writeTranscript(path string, events []copilot.SessionEvent) error {
	b, err := json.MarshalIndent(events, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal transcript: %w", err)
	}
	if err := os.WriteFile(path, b, 0o600); err != nil {
		return fmt.Errorf("write transcript: %w", err)
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
