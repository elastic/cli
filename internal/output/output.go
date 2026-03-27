// Package output provides the JSON envelope type, format constants, and
// rendering logic for structured CLI output.
package output

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// FormatText is the default human-readable output format.
const FormatText = "text"

// ErrAlreadyRendered is returned by Render when it successfully writes a JSON
// error envelope to the output stream. It signals that the error has already
// been presented to the user and the caller should exit non-zero without
// printing anything further. Use errors.Is to detect it.
var ErrAlreadyRendered = errors.New("error already rendered")

// FormatJSON is the machine-readable JSON envelope output format.
const FormatJSON = "json"

// OutputError is the error interface required by Render. All errors passed to
// Render must carry a machine-readable code via ErrorCode(), ensuring the JSON
// envelope always has a well-defined, non-guessed code field.
type OutputError interface {
	error
	ErrorCode() string
}

// Error is the structured error type used in the JSON envelope. It implements
// OutputError, so it can be passed directly to Render and also marshaled into
// the envelope's "error" field.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	cause   error  // preserved for errors.Is/As traversal; not marshaled
}

func (e *Error) Error() string     { return e.Message }
func (e *Error) ErrorCode() string { return e.Code }

// Unwrap preserves the error chain so errors.Is/As work on the wrapped cause.
func (e *Error) Unwrap() error { return e.cause }

// Envelope is the top-level JSON response structure emitted on stdout when
// --format=json is active. Exactly one of Data or Error should be non-nil.
// Warnings is always initialized to an empty slice so JSON output is [] not null.
type Envelope struct {
	Data     any      `json:"data"`
	Error    *Error   `json:"error"`
	Warnings []string `json:"warnings"`
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

// Render builds an Envelope from data and cmdErr, then writes it to w.
// cmdErr must implement OutputError, ensuring the JSON envelope always carries
// a well-typed error code set explicitly at the call site.
//
// When format is FormatJSON, the envelope is written as a single JSON line.
// When format is FormatText, data is written as plain text (string via
// fmt.Fprintln, other types via fmt.Fprintf("%v")), and cmdErr is returned
// directly for Cobra to handle.
func Render(w io.Writer, format string, data any, cmdErr OutputError) error {
	if format == FormatJSON {
		env := Envelope{
			Data:     data,
			Warnings: []string{},
		}
		if cmdErr != nil {
			env.Data = nil
			env.Error = &Error{Code: cmdErr.ErrorCode(), Message: cmdErr.Error()}
		}
		b, err := json.Marshal(env)
		if err != nil {
			return fmt.Errorf("marshal envelope: %w", err)
		}
		if _, err = fmt.Fprintf(w, "%s\n", b); err != nil {
			return err
		}
		if cmdErr != nil {
			return ErrAlreadyRendered
		}
		return nil
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
