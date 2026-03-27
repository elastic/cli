package errors_test

import (
	"errors"
	"fmt"
	"testing"

	apperrors "github.com/elastic/cli/internal/errors"
)

func TestConfigError(t *testing.T) {
	cause := fmt.Errorf("open /etc/config.yml: permission denied")
	err := &apperrors.ConfigError{Cause: cause}

	if err.ErrorCode() != "config_error" {
		t.Errorf("ErrorCode: got %q, want %q", err.ErrorCode(), "config_error")
	}
	if err.Error() != cause.Error() {
		t.Errorf("Error(): got %q, want %q", err.Error(), cause.Error())
	}
	if !errors.Is(err, cause) {
		t.Error("errors.Is: cause should be reachable via Unwrap")
	}
}

func TestContextNotFoundError_WithAvailable(t *testing.T) {
	err := &apperrors.ContextNotFoundError{Name: "bogus", Available: []string{"prod", "staging"}}

	if err.ErrorCode() != "context_not_found" {
		t.Errorf("ErrorCode: got %q, want %q", err.ErrorCode(), "context_not_found")
	}
	msg := err.Error()
	if msg != `context "bogus" not found; available: prod, staging` {
		t.Errorf("Error(): got %q", msg)
	}
}

func TestContextNotFoundError_NoAvailable(t *testing.T) {
	err := &apperrors.ContextNotFoundError{Name: "bogus"}

	msg := err.Error()
	if msg != `context "bogus" not found; no contexts are configured` {
		t.Errorf("Error(): got %q", msg)
	}
}

func TestInputError(t *testing.T) {
	cause := fmt.Errorf("read stdin: unexpected EOF")
	err := &apperrors.InputError{Cause: cause}

	if err.ErrorCode() != "input_error" {
		t.Errorf("ErrorCode: got %q, want %q", err.ErrorCode(), "input_error")
	}
	if !errors.Is(err, cause) {
		t.Error("errors.Is: cause should be reachable via Unwrap")
	}
}

func TestInvalidArgumentError(t *testing.T) {
	cause := fmt.Errorf(`unsupported format "xml"`)
	err := &apperrors.InvalidArgumentError{Cause: cause}

	if err.ErrorCode() != "invalid_argument" {
		t.Errorf("ErrorCode: got %q, want %q", err.ErrorCode(), "invalid_argument")
	}
	if !errors.Is(err, cause) {
		t.Error("errors.Is: cause should be reachable via Unwrap")
	}
}

func TestCommandError(t *testing.T) {
	cause := fmt.Errorf("something went wrong")
	err := &apperrors.CommandError{Cause: cause}

	if err.ErrorCode() != "command_failed" {
		t.Errorf("ErrorCode: got %q, want %q", err.ErrorCode(), "command_failed")
	}
	if !errors.Is(err, cause) {
		t.Error("errors.Is: cause should be reachable via Unwrap")
	}
}

func TestUnknownCommandError(t *testing.T) {
	cause := fmt.Errorf(`unknown command "bogus" for "elastic"`)
	err := &apperrors.UnknownCommandError{Cause: cause}

	if err.ErrorCode() != "unknown_command" {
		t.Errorf("ErrorCode(): got %q, want %q", err.ErrorCode(), "unknown_command")
	}
	if err.Error() != cause.Error() {
		t.Errorf("Error(): got %q, want %q", err.Error(), cause.Error())
	}
	if !errors.Is(err, cause) {
		t.Error("errors.Is: cause should be reachable via Unwrap")
	}
}

// ErrorCode() is defined on all types, satisfying output.OutputError implicitly.
// This compile-time assertion verifies each type satisfies the interface without
// importing the output package (interfaces are satisfied implicitly in Go).
type outputError interface {
	error
	ErrorCode() string
}

func TestAllTypesImplementOutputError(t *testing.T) {
	var _ outputError = &apperrors.ConfigError{}
	var _ outputError = &apperrors.ContextNotFoundError{}
	var _ outputError = &apperrors.InputError{}
	var _ outputError = &apperrors.InvalidArgumentError{}
	var _ outputError = &apperrors.CommandError{}
	var _ outputError = &apperrors.UnknownCommandError{}
}
