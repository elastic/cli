package cmdutil_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/elastic/cli/internal/cmdutil"
)

func TestRenderError_JSONFormat_StructuredError(t *testing.T) {
	var buf bytes.Buffer
	e := cmdutil.NewStructuredError(cmdutil.ErrCodeValidation, "bad input")
	cmdutil.RenderError(&buf, "json", e)

	var out struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		t.Fatalf("output is not valid JSON: %v\noutput: %s", err, buf.String())
	}
	if out.Error.Code != cmdutil.ErrCodeValidation {
		t.Errorf("code: got %q, want %q", out.Error.Code, cmdutil.ErrCodeValidation)
	}
	if out.Error.Message != "bad input" {
		t.Errorf("message: got %q, want %q", out.Error.Message, "bad input")
	}
}

func TestRenderError_JSONFormat_PlainError(t *testing.T) {
	var buf bytes.Buffer
	cmdutil.RenderError(&buf, "json", errors.New("something failed"))

	var out struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		t.Fatalf("output is not valid JSON: %v\noutput: %s", err, buf.String())
	}
	if out.Error.Code != cmdutil.ErrCodeInternal {
		t.Errorf("code: got %q, want %q", out.Error.Code, cmdutil.ErrCodeInternal)
	}
	if out.Error.Message != "something failed" {
		t.Errorf("message: got %q, want %q", out.Error.Message, "something failed")
	}
}

func TestRenderError_TableFormat(t *testing.T) {
	var buf bytes.Buffer
	e := cmdutil.NewStructuredError(cmdutil.ErrCodeContextNotFound, "ctx not found")
	cmdutil.RenderError(&buf, "table", e)

	got := buf.String()
	if !strings.Contains(got, "ctx not found") {
		t.Errorf("expected message in output, got: %q", got)
	}
}

func TestRenderError_PlainFormat(t *testing.T) {
	var buf bytes.Buffer
	cmdutil.RenderError(&buf, "plain", errors.New("plain failure"))

	got := buf.String()
	if !strings.Contains(got, "plain failure") {
		t.Errorf("expected message in output, got: %q", got)
	}
}
