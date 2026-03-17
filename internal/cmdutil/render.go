package cmdutil

import (
	"fmt"
	"io"
)

// RenderError writes err to w in the appropriate format.
// Under format=json it emits {"error":{"code":"...","message":"..."}} using the
// StructuredError fields if err is a *StructuredError, or falls back to
// ErrCodeInternal for plain errors.
// Under other formats it writes a plain "Error: <message>" string.
func RenderError(w io.Writer, format string, err error) {
	var se *StructuredError
	if e, ok := err.(*StructuredError); ok {
		se = e
	} else {
		se = &StructuredError{Code: ErrCodeInternal, Message: err.Error()}
	}

	if format == "json" {
		b, _ := se.MarshalJSON()
		fmt.Fprintf(w, "%s\n", b)
		return
	}

	fmt.Fprintf(w, "Error: %s\n", se.Message)
}
