// Package errors defines the typed error values used throughout the CLI.
// Each type implements output.OutputError, carrying a static machine-readable
// code alongside any domain-specific fields. Use errors.As to inspect errors
// returned from CLI commands.
package errors

import (
	"fmt"
	"strings"
)

// ConfigError is returned when the config file cannot be read or parsed.
type ConfigError struct {
	Cause error
}

func (e *ConfigError) Error() string     { return e.Cause.Error() }
func (e *ConfigError) ErrorCode() string { return "config_error" }
func (e *ConfigError) Unwrap() error     { return e.Cause }

// ContextNotFoundError is returned when --context names an unknown context.
type ContextNotFoundError struct {
	Name      string
	Available []string // sorted list of configured context names
}

func (e *ContextNotFoundError) Error() string {
	if len(e.Available) == 0 {
		return fmt.Sprintf("context %q not found; no contexts are configured", e.Name)
	}
	return fmt.Sprintf("context %q not found; available: %s", e.Name, strings.Join(e.Available, ", "))
}

func (e *ContextNotFoundError) ErrorCode() string { return "context_not_found" }

// InputError is returned when a --file or stdin read fails, or both are
// provided simultaneously.
type InputError struct {
	Cause error
}

func (e *InputError) Error() string     { return e.Cause.Error() }
func (e *InputError) ErrorCode() string { return "input_error" }
func (e *InputError) Unwrap() error     { return e.Cause }

// InvalidArgumentError is returned when a flag value is not supported (e.g.
// an unrecognised --format value).
type InvalidArgumentError struct {
	Cause error
}

func (e *InvalidArgumentError) Error() string     { return e.Cause.Error() }
func (e *InvalidArgumentError) ErrorCode() string { return "invalid_argument" }
func (e *InvalidArgumentError) Unwrap() error     { return e.Cause }

// CommandError wraps a generic handler error when no more specific type
// applies.
type CommandError struct {
	Cause error
}

// UnknownCommandError is returned when a Cobra-level unknown-command error
// occurs (e.g. the user typed a subcommand that does not exist).
type UnknownCommandError struct {
	Cause error
}

func (e *UnknownCommandError) Error() string     { return e.Cause.Error() }
func (e *UnknownCommandError) ErrorCode() string { return "unknown_command" }
func (e *UnknownCommandError) Unwrap() error     { return e.Cause }

func (e *CommandError) Error() string     { return e.Cause.Error() }
func (e *CommandError) ErrorCode() string { return "command_failed" }
func (e *CommandError) Unwrap() error     { return e.Cause }
