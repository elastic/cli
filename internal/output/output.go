// Package output provides the JSON envelope type, format constants, and
// rendering logic for structured CLI output.
package output

import (
	"encoding/json"
	"fmt"
	"io"
)

// FormatText is the default human-readable output format.
const FormatText = "text"

// FormatJSON is the machine-readable JSON envelope output format.
const FormatJSON = "json"

// Envelope is the top-level JSON response structure emitted on stdout when
// --format=json is active. Exactly one of Data or Error should be non-nil.
// Warnings is always initialized to an empty slice so JSON output is [] not null.
type Envelope struct {
	Data     any      `json:"data"`
	Error    *Error   `json:"error"`
	Warnings []string `json:"warnings"`
}

// Error is a structured error value embedded in an Envelope.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ValidateFormat returns nil if s is a supported format value, or an error
// listing the supported values otherwise.
func ValidateFormat(s string) error {
	switch s {
	case FormatText, FormatJSON:
		return nil
	default:
		return fmt.Errorf("unsupported format %q: supported values are %q and %q", s, FormatText, FormatJSON)
	}
}

// Render builds an Envelope from data and err, then writes it to w.
// When format is FormatJSON, the envelope is written as a single JSON line.
// When format is FormatText, data is written as plain text (string via
// fmt.Fprintln, other types via fmt.Fprintf("%v")), and err is returned
// directly for Cobra to handle.
func Render(w io.Writer, format string, data any, cmdErr error) error {
	if format == FormatJSON {
		env := Envelope{
			Data:     data,
			Warnings: []string{},
		}
		if cmdErr != nil {
			env.Data = nil
			env.Error = errorToStructured(cmdErr)
		}
		b, err := json.Marshal(env)
		if err != nil {
			return fmt.Errorf("marshal envelope: %w", err)
		}
		_, err = fmt.Fprintf(w, "%s\n", b)
		return err
	}

	// text mode: surface the original error so Cobra/Execute() can handle it.
	if cmdErr != nil {
		return cmdErr
	}
	if data != nil {
		if s, ok := data.(string); ok {
			fmt.Fprintln(w, s)
		} else {
			fmt.Fprintf(w, "%v\n", data)
		}
	}
	return nil
}

// errorToStructured maps a Go error to a structured Error with a machine-readable code.
func errorToStructured(err error) *Error {
	return &Error{
		Code:    classifyError(err),
		Message: err.Error(),
	}
}

// classifyError returns a snake_case error code for the given error.
// It inspects the error message heuristically; richer typed errors can be
// added later once more error types are defined.
func classifyError(err error) string {
	msg := err.Error()
	switch {
	case containsAny(msg, "context", "not found"):
		return "context_not_found"
	case containsAny(msg, "config"):
		return "config_error"
	case containsAny(msg, "stdin", "--file", "input"):
		return "input_error"
	case containsAny(msg, "unsupported format", "invalid_argument"):
		return "invalid_argument"
	default:
		return "command_failed"
	}
}

// containsAny reports whether s contains all of the given substrings.
func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		found := false
		for i := 0; i <= len(s)-len(sub); i++ {
			if s[i:i+len(sub)] == sub {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
