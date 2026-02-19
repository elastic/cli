package cmd

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/elastic/cli/internal/client"
	"github.com/spf13/cobra"
)

var docsAskOnce bool

var docsAskCmd = &cobra.Command{
	Use:   "ask <question>",
	Short: "Ask a question about Elastic documentation using AI",
	Long: `Ask a question about Elastic documentation and get an AI-generated answer
rendered in your terminal. By default, enters an interactive follow-up loop.

Examples:
  elastic docs ask "What is Elasticsearch?"
  elastic docs ask "How do I create an ingest pipeline?" --once`,
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		question := strings.TrimSpace(args[0])
		if question == "" {
			return fmt.Errorf("question is required")
		}

		renderer, err := glamour.NewTermRenderer(
			glamour.WithAutoStyle(),
			glamour.WithWordWrap(100),
		)
		if err != nil {
			return fmt.Errorf("init markdown renderer: %w", err)
		}

		conversationID := newUUID()
		if err := docsAskQuestion(cmd, renderer, question, conversationID); err != nil {
			return err
		}

		if docsAskOnce {
			return nil
		}

		scanner := bufio.NewScanner(os.Stdin)
		for {
			fmt.Fprint(cmd.ErrOrStderr(), "\nAsk a follow-up (or press Enter to quit): ")
			if !scanner.Scan() {
				break
			}
			followUp := strings.TrimSpace(scanner.Text())
			if followUp == "" {
				break
			}
			if err := docsAskQuestion(cmd, renderer, followUp, conversationID); err != nil {
				fmt.Fprintf(cmd.ErrOrStderr(), "Error: %v\n", err)
			}
		}

		return scanner.Err()
	},
}

// --- bubbletea model ---

type askPhase int

const (
	askPhaseThinking  askPhase = iota
	askPhaseReceiving
)

type askModel struct {
	spinner      spinner.Model
	phase        askPhase
	accumulated  *strings.Builder
	renderer     *glamour.TermRenderer
	events       <-chan client.SSEEvent
	errc         <-chan error
	streamErr    error
	done         bool
	refsStarted bool
}

type sseEventMsg client.SSEEvent
type sseDoneMsg struct{}

func (m askModel) pollSSE() tea.Msg {
	ev, ok := <-m.events
	if !ok {
		return sseDoneMsg{}
	}
	return sseEventMsg(ev)
}

func newAskModel(renderer *glamour.TermRenderer, events <-chan client.SSEEvent, errc <-chan error) askModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	return askModel{
		spinner:     s,
		phase:       askPhaseThinking,
		accumulated: &strings.Builder{},
		renderer:    renderer,
		events:      events,
		errc:        errc,
	}
}

func (m askModel) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, m.pollSSE)
}

func (m askModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			m.done = true
			return m, tea.Quit
		}

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case sseEventMsg:
		cmds := m.handleSSEEvent(client.SSEEvent(msg))
		if m.done {
			return m, tea.Sequence(append(cmds, tea.Quit)...)
		}
		cmds = append(cmds, m.pollSSE)
		return m, tea.Batch(cmds...)

	case sseDoneMsg:
		cmds := m.flushRemaining()
		m.done = true
		return m, tea.Sequence(append(cmds, tea.Quit)...)
	}

	return m, nil
}

func (m *askModel) handleSSEEvent(ev client.SSEEvent) []tea.Cmd {
	if ev.Data == "" {
		return nil
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(ev.Data), &payload); err != nil {
		return nil
	}

	switch payload["type"] {
	case "message_chunk":
		if m.phase == askPhaseThinking {
			m.phase = askPhaseReceiving
		}
		if m.refsStarted {
			return nil
		}
		if chunk, ok := payload["content"].(string); ok {
			m.accumulated.WriteString(chunk)
		}
		return m.tryFlushParagraphs()

	case "message_complete":
		cmds := m.flushRemaining()
		m.done = true
		return cmds
	}

	return nil
}

func (m *askModel) tryFlushParagraphs() []tea.Cmd {
	text := m.accumulated.String()

	if idx := strings.Index(text, "<!--REFERENCES"); idx >= 0 {
		text = strings.TrimSpace(text[:idx])
		m.accumulated.Reset()
		m.accumulated.WriteString(text)
		m.refsStarted = true
	}

	var cmds []tea.Cmd
	for {
		para, rest, found := splitCompleteParagraph(text)
		if !found {
			break
		}
		rendered := m.renderBlock(para)
		if rendered != "" {
			cmds = append(cmds, tea.Println(rendered))
		}
		text = rest
	}

	m.accumulated.Reset()
	m.accumulated.WriteString(text)
	return cmds
}

func (m *askModel) flushRemaining() []tea.Cmd {
	remaining := strings.TrimSpace(m.accumulated.String())
	remaining = stripReferencesComment(remaining)
	remaining = strings.TrimSpace(remaining)
	m.accumulated.Reset()

	if remaining == "" {
		return nil
	}

	rendered := m.renderBlock(remaining)
	if rendered != "" {
		return []tea.Cmd{tea.Println(rendered)}
	}
	return []tea.Cmd{tea.Println(remaining)}
}

func (m *askModel) renderBlock(md string) string {
	md = strings.TrimSpace(md)
	if md == "" {
		return ""
	}
	rendered, err := m.renderer.Render(md)
	if err != nil {
		return md
	}
	return strings.TrimRight(rendered, "\n")
}

var askTitleStyle = lipgloss.NewStyle().Faint(true)

func (m askModel) View() string {
	var title string
	switch m.phase {
	case askPhaseThinking:
		title = "Thinking..."
	case askPhaseReceiving:
		title = "Receiving..."
	}
	return m.spinner.View() + " " + askTitleStyle.Render(title)
}

// splitCompleteParagraph finds the first paragraph break (\n\n) that isn't
// inside a fenced code block. Returns (paragraph, rest, true) if found.
func splitCompleteParagraph(text string) (string, string, bool) {
	inFence := false
	i := 0
	for i < len(text) {
		if i+2 < len(text) && text[i:i+3] == "```" {
			inFence = !inFence
			i += 3
			continue
		}
		if !inFence && i+1 < len(text) && text[i] == '\n' && text[i+1] == '\n' {
			return text[:i], text[i+2:], true
		}
		i++
	}
	return "", text, false
}

func stripReferencesComment(s string) string {
	if idx := strings.Index(s, "<!--REFERENCES"); idx >= 0 {
		s = s[:idx]
	}
	return s
}

// --- orchestration ---

func docsAskQuestion(cmd *cobra.Command, renderer *glamour.TermRenderer, question string, conversationID string) error {
	ctx := context.Background()
	events, errc := client.DocsAskStream(ctx, question, conversationID)

	m := newAskModel(renderer, events, errc)
	p := tea.NewProgram(m, tea.WithOutput(cmd.ErrOrStderr()))
	finalModel, err := p.Run()
	if err != nil {
		return err
	}

	fm := finalModel.(askModel)
	if fm.streamErr != nil {
		return fm.streamErr
	}

	if err := <-errc; err != nil {
		return err
	}

	return nil
}

func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func init() {
	docsCmd.AddCommand(docsAskCmd)

	docsAskCmd.Flags().BoolVar(&docsAskOnce, "once", false, "Return immediately after the first answer (no follow-up prompt)")
}
