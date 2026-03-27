package factory

import (
	"bytes"
	"errors"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/elastic/cli/internal/factory/factorytest"
	"github.com/spf13/cobra"
)

// executeCmd runs the named subcommand under a fresh root command and returns
// the RunE error (if any). The root registers --context as a PersistentFlag,
// matching real-app wiring. Extra args follow the subcommand name.
func executeCmd(t *testing.T, sub *cobra.Command, args ...string) error {
	t.Helper()
	var contextFlag string
	root := &cobra.Command{Use: "root", SilenceErrors: true, SilenceUsage: true}
	root.PersistentFlags().StringVar(&contextFlag, "context", "", "")
	root.AddCommand(sub)
	root.SetArgs(append([]string{sub.Use}, args...))
	return root.Execute()
}

// ---- New() command fields ---------------------------------------------------

func TestNew_Use(t *testing.T) {
	cmd := New("my-cmd", "short desc", func(ctx RunContext) error { return nil })
	if cmd.Use != "my-cmd" {
		t.Errorf("Use: got %q, want %q", cmd.Use, "my-cmd")
	}
}

func TestNew_Short(t *testing.T) {
	cmd := New("my-cmd", "short desc", func(ctx RunContext) error { return nil })
	if cmd.Short != "short desc" {
		t.Errorf("Short: got %q, want %q", cmd.Short, "short desc")
	}
}

// ---- handler call count -----------------------------------------------------

func TestNew_HandlerCalledOnce(t *testing.T) {
	yaml := `
current_context: test
contexts:
  test:
    elasticsearch:
      url: http://localhost:9200
`
	configPath := factorytest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	callCount := 0
	cmd := New("sub", "desc", func(ctx RunContext) error {
		callCount++
		return nil
	})

	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if callCount != 1 {
		t.Errorf("handler called %d times, want 1", callCount)
	}
}

// ---- RunContext.Config -------------------------------------------------------

func TestNew_RunContextConfig(t *testing.T) {
	yaml := `
current_context: prod
contexts:
  prod:
    elasticsearch:
      url: https://my-cluster.es.io
      username: elastic
      password: s3cr3t
`
	configPath := factorytest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received.Config.CurrentContext != "prod" {
		t.Errorf("Config.CurrentContext: got %q, want %q", received.Config.CurrentContext, "prod")
	}
	es := received.Config.Contexts["prod"].Elasticsearch
	if es.URL != "https://my-cluster.es.io" {
		t.Errorf("URL: got %q, want %q", es.URL, "https://my-cluster.es.io")
	}
	if es.Username != "elastic" {
		t.Errorf("Username: got %q, want %q", es.Username, "elastic")
	}
}

// ---- RunContext.ConfigPath ---------------------------------------------------

func TestNew_RunContextConfigPath(t *testing.T) {
	configPath := factorytest.TempConfigFile(t, []byte("current_context: dev\n"))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received.ConfigPath != configPath {
		t.Errorf("ConfigPath: got %q, want %q", received.ConfigPath, configPath)
	}
}

// ---- handler error propagation ----------------------------------------------

func TestNew_HandlerErrorPropagates(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	want := errors.New("handler failure")
	cmd := New("sub", "desc", func(ctx RunContext) error { return want })

	err := executeCmd(t, cmd)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, want) {
		t.Errorf("got error %v, want %v", err, want)
	}
}

// ---- two commands share the same config from one file -----------------------

func TestNew_TwoCommandsSameConfig(t *testing.T) {
	yaml := `
current_context: shared
contexts:
  shared:
    elasticsearch:
      url: http://shared.es.io
`
	configPath := factorytest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var ctx1, ctx2 RunContext
	cmd1 := New("cmd-one", "first", func(ctx RunContext) error { ctx1 = ctx; return nil })
	cmd2 := New("cmd-two", "second", func(ctx RunContext) error { ctx2 = ctx; return nil })

	if err := executeCmd(t, cmd1); err != nil {
		t.Fatalf("cmd1: %v", err)
	}
	if err := executeCmd(t, cmd2); err != nil {
		t.Fatalf("cmd2: %v", err)
	}

	if ctx1.Config.CurrentContext != ctx2.Config.CurrentContext {
		t.Errorf("CurrentContext mismatch: cmd1=%q cmd2=%q",
			ctx1.Config.CurrentContext, ctx2.Config.CurrentContext)
	}
	if ctx1.ConfigPath != ctx2.ConfigPath {
		t.Errorf("ConfigPath mismatch: cmd1=%q cmd2=%q", ctx1.ConfigPath, ctx2.ConfigPath)
	}
	url1 := ctx1.Config.Contexts["shared"].Elasticsearch.URL
	url2 := ctx2.Config.Contexts["shared"].Elasticsearch.URL
	if url1 != url2 {
		t.Errorf("URL mismatch: cmd1=%q cmd2=%q", url1, url2)
	}
}

// ---- no config file: defaults used, ConfigPath empty -----------------------

func TestNew_NoConfigFile_XDGEmpty(t *testing.T) {
	// No elastic/config.yml inside the XDG dir → Load sees IsNotExist → defaults.
	tmpDir := t.TempDir()
	t.Setenv("ELASTIC_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", tmpDir)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := defaultConfig()
	if received.Config.CurrentContext != want.CurrentContext {
		t.Errorf("CurrentContext: got %q, want %q",
			received.Config.CurrentContext, want.CurrentContext)
	}
	if received.Config.Contexts == nil {
		t.Error("Contexts is nil, want non-nil empty map")
	}
	if received.ConfigPath != "" {
		t.Errorf("ConfigPath: got %q, want empty string", received.ConfigPath)
	}
}

func TestNew_NoConfigFile_HomeEmpty(t *testing.T) {
	// No .config/elastic/config.yml under HOME → same graceful fallback.
	tmpDir := t.TempDir()
	t.Setenv("ELASTIC_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("HOME", tmpDir)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := defaultConfig()
	if received.Config.CurrentContext != want.CurrentContext {
		t.Errorf("CurrentContext: got %q, want %q",
			received.Config.CurrentContext, want.CurrentContext)
	}
	if received.Config.Contexts == nil {
		t.Error("Contexts is nil, want non-nil empty map")
	}
	if received.ConfigPath != "" {
		t.Errorf("ConfigPath: got %q, want empty string", received.ConfigPath)
	}
}

// ---- config file values flow into RunContext.Config ------------------------

func TestNew_ConfigValues_APIKey(t *testing.T) {
	yaml := `
current_context: dev
contexts:
  dev:
    elasticsearch:
      url: http://localhost:9200
      api_key: test123
`
	configPath := factorytest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})
	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received.Config.CurrentContext != "dev" {
		t.Errorf("CurrentContext: got %q, want %q", received.Config.CurrentContext, "dev")
	}
	es := received.Config.Contexts["dev"].Elasticsearch
	if es.URL != "http://localhost:9200" {
		t.Errorf("URL: got %q, want %q", es.URL, "http://localhost:9200")
	}
	if es.APIKey != "test123" {
		t.Errorf("APIKey: got %q, want %q", es.APIKey, "test123")
	}
}

func TestNew_ConfigValues_PartialContext_DefaultsForMissingFields(t *testing.T) {
	yaml := `
current_context: minimal
contexts:
  minimal:
    elasticsearch:
      url: http://localhost:9200
`
	configPath := factorytest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})
	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	es := received.Config.Contexts["minimal"].Elasticsearch
	if es.Username != "" {
		t.Errorf("Username: got %q, want empty string", es.Username)
	}
	if es.Password != "" {
		t.Errorf("Password: got %q, want empty string", es.Password)
	}
	if es.APIKey != "" {
		t.Errorf("APIKey: got %q, want empty string", es.APIKey)
	}
}

func TestNew_ConfigValues_MultipleContexts(t *testing.T) {
	yaml := `
current_context: prod
contexts:
  prod:
    elasticsearch:
      url: https://prod.es.io
      username: admin
      password: secret
  dev:
    elasticsearch:
      url: http://localhost:9200
      api_key: devkey==
`
	configPath := factorytest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})
	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(received.Config.Contexts) != 2 {
		t.Fatalf("Contexts length: got %d, want 2", len(received.Config.Contexts))
	}
	prod := received.Config.Contexts["prod"].Elasticsearch
	if prod.URL != "https://prod.es.io" {
		t.Errorf("prod URL: got %q, want %q", prod.URL, "https://prod.es.io")
	}
	if prod.Username != "admin" {
		t.Errorf("prod Username: got %q, want %q", prod.Username, "admin")
	}
	dev := received.Config.Contexts["dev"].Elasticsearch
	if dev.APIKey != "devkey==" {
		t.Errorf("dev APIKey: got %q, want %q", dev.APIKey, "devkey==")
	}
}

// ---- --context flag resolution ---------------------------------------------

// twoContextConfig is the shared YAML fixture for context-resolution tests:
// current_context=prod, two contexts: prod and dev.
const twoContextConfig = `
current_context: prod
contexts:
  prod:
    elasticsearch:
      url: https://prod.es.io
  dev:
    elasticsearch:
      url: http://localhost:9200
`

func TestNew_Context_FlagOverridesCurrentContext(t *testing.T) {
	configPath := factorytest.TempConfigFile(t, []byte(twoContextConfig))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error { received = ctx; return nil })
	if err := executeCmd(t, cmd, "--context=dev"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received.ActiveContext != "dev" {
		t.Errorf("ActiveContext: got %q, want %q", received.ActiveContext, "dev")
	}
}

func TestNew_Context_DefaultsToCurrentContext(t *testing.T) {
	configPath := factorytest.TempConfigFile(t, []byte(twoContextConfig))
	t.Setenv("ELASTIC_CONFIG", configPath)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error { received = ctx; return nil })
	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received.ActiveContext != "prod" {
		t.Errorf("ActiveContext: got %q, want %q", received.ActiveContext, "prod")
	}
}

func TestNew_Context_UnknownName_ErrorListsAvailable(t *testing.T) {
	configPath := factorytest.TempConfigFile(t, []byte(twoContextConfig))
	t.Setenv("ELASTIC_CONFIG", configPath)

	cmd := New("sub", "desc", func(ctx RunContext) error { return nil })
	err := executeCmd(t, cmd, "--context=missing")
	if err == nil {
		t.Fatal("expected error for unknown context, got nil")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q should contain 'not found'", err.Error())
	}
	if !strings.Contains(err.Error(), "prod") {
		t.Errorf("error %q should contain 'prod'", err.Error())
	}
	if !strings.Contains(err.Error(), "dev") {
		t.Errorf("error %q should contain 'dev'", err.Error())
	}
}

func TestNew_Context_NoConfigFile_NoFlag_EmptyActiveContext(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error { received = ctx; return nil })
	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received.ActiveContext != "" {
		t.Errorf("ActiveContext: got %q, want empty string", received.ActiveContext)
	}
}

func TestNew_Context_NoConfigFile_WithFlag_Errors(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	cmd := New("sub", "desc", func(ctx RunContext) error { return nil })
	err := executeCmd(t, cmd, "--context=anything")
	if err == nil {
		t.Fatal("expected error when --context set but no contexts configured, got nil")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q should contain 'not found'", err.Error())
	}
}

// ---- RunContext.Body -----------------------------------------------

// TestNew_Body_NilWhenNoInputConfigured asserts that RunContext exposes a Body
// []byte field and that it is nil when the command is invoked with no input
// source configured (no piped stdin, no --file flag).
func TestNew_Body_NilWhenNoInputConfigured(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmd(t, cmd); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received.Body != nil {
		t.Errorf("Body: got %v, want nil", received.Body)
	}
}

// ---- RunContext.Body via stdin ------------------------------------

// executecmdWithStdin runs the named subcommand with r wired as the command's
// stdin via cmd.SetIn, which New() reads via cmd.InOrStdin().
func executeCmdWithStdin(t *testing.T, sub *cobra.Command, r io.Reader, args ...string) error {
	t.Helper()
	sub.SetIn(r)
	return executeCmd(t, sub, args...)
}

// TestNew_Body_PopulatedFromStdin verifies that when a non-empty reader is
// injected as stdin, Body is set to the reader's bytes.
func TestNew_Body_PopulatedFromStdin(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	payload := []byte(`{"x":1}`)
	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmdWithStdin(t, cmd, bytes.NewReader(payload)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(received.Body, payload) {
		t.Errorf("Body: got %q, want %q", received.Body, payload)
	}
}

// TestNew_Body_NilWhenStdinEmpty verifies that an injected reader with zero
// bytes results in a nil Body (not an empty non-nil slice).
func TestNew_Body_NilWhenStdinEmpty(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmdWithStdin(t, cmd, bytes.NewReader(nil)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received.Body != nil {
		t.Errorf("Body: got %q, want nil", received.Body)
	}
}

// ---- RunContext.Body via --file ------------------------------------

// TestNew_Body_PopulatedFromFile verifies that --file reads the file and
// sets Body to its contents.
func TestNew_Body_PopulatedFromFile(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	payload := []byte(`{"hello":"world"}`)
	filePath := factorytest.TempDataFile(t, payload)

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmd(t, cmd, "--file", filePath); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(received.Body, payload) {
		t.Errorf("Body: got %q, want %q", received.Body, payload)
	}
}

// TestNew_Body_ErrorWhenFileNotFound verifies that a non-existent --file path
// returns an error and does not invoke the handler.
func TestNew_Body_ErrorWhenFileNotFound(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	handlerCalled := false
	cmd := New("sub", "desc", func(ctx RunContext) error {
		handlerCalled = true
		return nil
	})

	err := executeCmd(t, cmd, "--file", "/nonexistent/path/payload.json")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
	if handlerCalled {
		t.Error("handler must not be called when --file path does not exist")
	}
}

// TestNew_Body_ErrorWhenFileUnreadable verifies that an unreadable --file
// returns an error and does not invoke the handler.
func TestNew_Body_ErrorWhenFileUnreadable(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("permission check meaningless as root")
	}
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	filePath := factorytest.TempConfigFileUnreadable(t, []byte(`{}`))

	handlerCalled := false
	cmd := New("sub", "desc", func(ctx RunContext) error {
		handlerCalled = true
		return nil
	})

	err := executeCmd(t, cmd, "--file", filePath)
	if err == nil {
		t.Fatal("expected error for unreadable file, got nil")
	}
	if handlerCalled {
		t.Error("handler must not be called when --file is unreadable")
	}
}

// TestNew_Body_NilWhenFileEmpty verifies that a zero-byte --file yields nil
// Body without error.
func TestNew_Body_NilWhenFileEmpty(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	filePath := factorytest.TempDataFile(t, []byte{})

	var received RunContext
	cmd := New("sub", "desc", func(ctx RunContext) error {
		received = ctx
		return nil
	})

	if err := executeCmd(t, cmd, "--file", filePath); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received.Body != nil {
		t.Errorf("Body: got %q, want nil for empty file", received.Body)
	}
}

// ---- Conflict: both stdin and --file provided ----------------------

// TestNew_Body_ErrorWhenBothStdinAndFile verifies that providing data via both
// piped stdin and --file is rejected before the handler is invoked.
func TestNew_Body_ErrorWhenBothStdinAndFile(t *testing.T) {
	t.Setenv("ELASTIC_CONFIG", factorytest.TempConfigFile(t, []byte("")))

	filePath := factorytest.TempDataFile(t, []byte(`{"source":"file"}`))
	stdinData := bytes.NewReader([]byte(`{"source":"stdin"}`))

	handlerCalled := false
	cmd := New("sub", "desc", func(ctx RunContext) error {
		handlerCalled = true
		return nil
	})

	err := executeCmdWithStdin(t, cmd, stdinData, "--file", filePath)
	if err == nil {
		t.Fatal("expected error when both stdin and --file provide data, got nil")
	}
	if !strings.Contains(err.Error(), "only one") {
		t.Errorf("error %q should mention 'only one' input source", err.Error())
	}
	if handlerCalled {
		t.Error("handler must not be called when input source is ambiguous")
	}
}
