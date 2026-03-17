package cmdutil

import "encoding/json"

// Error code constants for StructuredError.
const (
	ErrCodeValidation         = "validation_error"
	ErrCodeConfigNotFound     = "config_not_found"
	ErrCodeContextNotFound    = "context_not_found"
	ErrCodeNoContextSelected  = "no_context_selected"
	ErrCodeDryRunNotSupported = "dry_run_not_supported"
	ErrCodeInternal           = "internal_error"
)

// StructuredError is a machine-parseable error with a short code and human message.
// It implements the error interface and serializes to
// {"error":{"code":"...","message":"..."}} under --format=json.
type StructuredError struct {
	Code    string
	Message string
}

func (e *StructuredError) Error() string {
	return e.Message
}

func (e *StructuredError) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}{
		Error: struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}{Code: e.Code, Message: e.Message},
	})
}

// NewStructuredError returns a *StructuredError with the given code and message.
// If err is already a *StructuredError, it is returned unchanged (idempotent).
func NewStructuredError(code, message string) *StructuredError {
	return &StructuredError{Code: code, Message: message}
}

// WrapError wraps err as a *StructuredError with the given code.
// If err is already a *StructuredError, it is returned unchanged.
func WrapError(code string, err error) *StructuredError {
	if se, ok := err.(*StructuredError); ok {
		return se
	}
	return &StructuredError{Code: code, Message: err.Error()}
}
