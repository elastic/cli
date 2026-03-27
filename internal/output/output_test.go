package output_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	apperrors "github.com/elastic/cli/internal/errors"
	"github.com/elastic/cli/internal/output"
)

// ---- Envelope JSON marshaling -----------------------------------------------

func TestEnvelope_SuccessMarshaling(t *testing.T) {
	env := output.Envelope{
		Data:     "elastic version dev",
		Error:    nil,
		Warnings: []string{},
	}
	b, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if got["data"] != "elastic version dev" {
		t.Errorf("data: got %v, want %q", got["data"], "elastic version dev")
	}
	if got["error"] != nil {
		t.Errorf("error: got %v, want nil", got["error"])
	}
}

func TestEnvelope_ErrorMarshaling(t *testing.T) {
	env := output.Envelope{
		Data:     nil,
		Error:    &output.Error{Code: "command_failed", Message: "something went wrong"},
		Warnings: []string{},
	}
	b, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if got["data"] != nil {
		t.Errorf("data: got %v, want nil", got["data"])
	}
	errObj, ok := got["error"].(map[string]any)
	if !ok {
		t.Fatalf("error field is not an object: %v", got["error"])
	}
	if errObj["code"] != "command_failed" {
		t.Errorf("error.code: got %v, want %q", errObj["code"], "command_failed")
	}
	if errObj["message"] != "something went wrong" {
		t.Errorf("error.message: got %v", errObj["message"])
	}
}

func TestEnvelope_WarningsMarshaling(t *testing.T) {
	env := output.Envelope{
		Data:     "ok",
		Error:    nil,
		Warnings: []string{"msg1", "msg2"},
	}
	b, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	warnings, ok := got["warnings"].([]any)
	if !ok {
		t.Fatalf("warnings field is not an array: %v", got["warnings"])
	}
	if len(warnings) != 2 {
		t.Errorf("warnings len: got %d, want 2", len(warnings))
	}
}

func TestEnvelope_NullFields(t *testing.T) {
	env := output.Envelope{
		Data:     nil,
		Error:    nil,
		Warnings: []string{},
	}
	b, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if !json.Valid(b) {
		t.Error("marshaled output is not valid JSON")
	}
}

func TestEnvelope_EmptyWarningsAsArray(t *testing.T) {
	env := output.Envelope{
		Data:     "x",
		Error:    nil,
		Warnings: []string{},
	}
	b, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	warnings, ok := got["warnings"].([]any)
	if !ok {
		t.Fatalf("warnings should be [] not null; got %v", got["warnings"])
	}
	if len(warnings) != 0 {
		t.Errorf("warnings should be empty, got %v", warnings)
	}
}

// ---- ValidateFormat ---------------------------------------------------------

func TestValidateFormat_ValidValues(t *testing.T) {
	for _, v := range []string{output.FormatText, output.FormatJSON} {
		if err := output.ValidateFormat(v); err != nil {
			t.Errorf("ValidateFormat(%q): unexpected error: %v", v, err)
		}
	}
}

func TestValidateFormat_InvalidValue(t *testing.T) {
	if err := output.ValidateFormat("xml"); err == nil {
		t.Error("ValidateFormat(\"xml\"): expected error, got nil")
	}
}

func TestValidateFormat_EmptyString(t *testing.T) {
	if err := output.ValidateFormat(""); err == nil {
		t.Error("ValidateFormat(\"\"): expected error, got nil")
	}
}

// ---- Render -----------------------------------------------------------------

func TestRender_JSONSuccess(t *testing.T) {
	var buf strings.Builder
	if err := output.Render(&buf, output.FormatJSON, "elastic version dev", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := buf.String()
	if !json.Valid([]byte(strings.TrimSpace(got))) {
		t.Errorf("output is not valid JSON: %q", got)
	}
	var env map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(got)), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env["data"] != "elastic version dev" {
		t.Errorf("data: got %v, want %q", env["data"], "elastic version dev")
	}
	if env["error"] != nil {
		t.Errorf("error: got %v, want nil", env["error"])
	}
}

func TestRender_JSONError(t *testing.T) {
	var buf strings.Builder
	err := output.Render(&buf, output.FormatJSON, nil, &apperrors.CommandError{Cause: fmt.Errorf("oops")})
	if !errors.Is(err, output.ErrAlreadyRendered) {
		t.Fatalf("expected ErrAlreadyRendered, got: %v", err)
	}
	got := buf.String()
	var env map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(got)), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env["data"] != nil {
		t.Errorf("data: got %v, want nil", env["data"])
	}
	errObj, ok := env["error"].(map[string]any)
	if !ok {
		t.Fatalf("error field is not an object: %v", env["error"])
	}
	if errObj["code"] == "" {
		t.Error("error.code is empty")
	}
	if errObj["message"] != "oops" {
		t.Errorf("error.message: got %v, want %q", errObj["message"], "oops")
	}
}

func TestRender_TextSuccess(t *testing.T) {
	var buf strings.Builder
	if err := output.Render(&buf, output.FormatText, "hello world", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := strings.TrimSpace(buf.String()); got != "hello world" {
		t.Errorf("output: got %q, want %q", got, "hello world")
	}
}

func TestRender_TextErrorPassthrough(t *testing.T) {
	var buf strings.Builder
	cause := fmt.Errorf("text error")
	outErr := &apperrors.CommandError{Cause: cause}
	err := output.Render(&buf, output.FormatText, nil, outErr)
	if !errors.Is(err, cause) {
		t.Errorf("expected cause in error chain, got %v", err)
	}
}

func TestRender_JSONWarningsEmbedded(t *testing.T) {
	var buf strings.Builder
	if err := output.Render(&buf, output.FormatJSON, "data", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var env map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(buf.String())), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	warnings, ok := env["warnings"].([]any)
	if !ok {
		t.Fatalf("warnings should be [] not null; got %v", env["warnings"])
	}
	_ = warnings
}

func TestRender_JSONNilDataProducesNull(t *testing.T) {
	var buf strings.Builder
	if err := output.Render(&buf, output.FormatJSON, nil, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var env map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(buf.String())), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := env["data"]; !ok {
		t.Error("data key missing from envelope")
	}
	if env["data"] != nil {
		t.Errorf("data: got %v, want nil", env["data"])
	}
}

func TestValidateFormat_CaseSensitive(t *testing.T) {
	if err := output.ValidateFormat("JSON"); err == nil {
		t.Error("ValidateFormat(\"JSON\"): expected error (case sensitive), got nil")
	}
	if err := output.ValidateFormat("Text"); err == nil {
		t.Error("ValidateFormat(\"Text\"): expected error (case sensitive), got nil")
	}
}

// ---- typed errors satisfy OutputError -------------------------------------

// Verify that the apperrors types satisfy output.OutputError at compile time.
// No imports of internal/errors are needed in output itself; the interface is
// satisfied implicitly.
func TestTypedErrors_SatisfyOutputError(t *testing.T) {
	var _ output.OutputError = &apperrors.ConfigError{Cause: fmt.Errorf("x")}
	var _ output.OutputError = &apperrors.ContextNotFoundError{Name: "x"}
	var _ output.OutputError = &apperrors.InputError{Cause: fmt.Errorf("x")}
	var _ output.OutputError = &apperrors.InvalidArgumentError{Cause: fmt.Errorf("x")}
	var _ output.OutputError = &apperrors.CommandError{Cause: fmt.Errorf("x")}
}

func TestTypedErrors_RenderUsesCode(t *testing.T) {
	cases := []struct {
		name string
		err  output.OutputError
		code string
	}{
		{"config", &apperrors.ConfigError{Cause: fmt.Errorf("e")}, "config_error"},
		{"context", &apperrors.ContextNotFoundError{Name: "x"}, "context_not_found"},
		{"input", &apperrors.InputError{Cause: fmt.Errorf("e")}, "input_error"},
		{"invalid_arg", &apperrors.InvalidArgumentError{Cause: fmt.Errorf("e")}, "invalid_argument"},
		{"command", &apperrors.CommandError{Cause: fmt.Errorf("e")}, "command_failed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var buf strings.Builder
			if err := output.Render(&buf, output.FormatJSON, nil, tc.err); !errors.Is(err, output.ErrAlreadyRendered) {
				t.Fatalf("expected ErrAlreadyRendered, got: %v", err)
			}
			var env map[string]any
			if err := json.Unmarshal([]byte(strings.TrimSpace(buf.String())), &env); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			errObj := env["error"].(map[string]any)
			if errObj["code"] != tc.code {
				t.Errorf("code: got %v, want %q", errObj["code"], tc.code)
			}
		})
	}
}
