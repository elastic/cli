package cmdutil_test

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/elastic/cli/internal/cmdutil"
)

func TestStructuredError_Error(t *testing.T) {
	e := cmdutil.NewStructuredError(cmdutil.ErrCodeValidation, "something went wrong")
	if e.Error() != "something went wrong" {
		t.Fatalf("expected %q, got %q", "something went wrong", e.Error())
	}
}

func TestStructuredError_Fields(t *testing.T) {
	e := cmdutil.NewStructuredError(cmdutil.ErrCodeContextNotFound, "no such context")
	if e.Code != cmdutil.ErrCodeContextNotFound {
		t.Errorf("Code: got %q, want %q", e.Code, cmdutil.ErrCodeContextNotFound)
	}
	if e.Message != "no such context" {
		t.Errorf("Message: got %q, want %q", e.Message, "no such context")
	}
}

func TestNewStructuredError_Idempotent(t *testing.T) {
	orig := cmdutil.NewStructuredError(cmdutil.ErrCodeValidation, "original")
	// passing an existing *StructuredError should return it unchanged
	wrapped := cmdutil.NewStructuredError(cmdutil.ErrCodeInternal, "ignored")
	_ = wrapped
	// idempotency via WrapError
	same := cmdutil.WrapError(cmdutil.ErrCodeInternal, orig)
	if same != orig {
		t.Fatal("WrapError should return existing *StructuredError unchanged")
	}
}

func TestWrapError_PlainError(t *testing.T) {
	plain := errors.New("plain error")
	e := cmdutil.WrapError(cmdutil.ErrCodeConfigNotFound, plain)
	if e.Code != cmdutil.ErrCodeConfigNotFound {
		t.Errorf("Code: got %q, want %q", e.Code, cmdutil.ErrCodeConfigNotFound)
	}
	if e.Message != "plain error" {
		t.Errorf("Message: got %q, want %q", e.Message, "plain error")
	}
}

func TestStructuredError_JSONMarshal(t *testing.T) {
	e := cmdutil.NewStructuredError(cmdutil.ErrCodeInternal, "boom")
	b, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	var out struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if out.Error.Code != cmdutil.ErrCodeInternal {
		t.Errorf("code: got %q, want %q", out.Error.Code, cmdutil.ErrCodeInternal)
	}
	if out.Error.Message != "boom" {
		t.Errorf("message: got %q, want %q", out.Error.Message, "boom")
	}
}
