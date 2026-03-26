package cmd

import (
	"strings"
	"testing"

	"github.com/elastic/cli/cmd/cmdtest"
)

func TestRootCmd_UseAndShort(t *testing.T) {
	if rootCmd.Use != "elastic" {
		t.Errorf("rootCmd.Use = %q; want %q", rootCmd.Use, "elastic")
	}
	if rootCmd.Short == "" {
		t.Error("rootCmd.Short is empty")
	}
}

func TestRootCmd_ContextFlag(t *testing.T) {
	if rootCmd.PersistentFlags().Lookup("context") == nil {
		t.Error("--context persistent flag not registered on rootCmd")
	}
}

func TestRootCmd_FactoryCommandPresent(t *testing.T) {
	found := false
	for _, cmd := range rootCmd.Commands() {
		if cmd.Use == "version" {
			found = true
			break
		}
	}
	if !found {
		t.Error("factory-produced 'version' command not found in rootCmd.Commands()")
	}
}

func TestRootCmd_SilenceUsage(t *testing.T) {
	if !rootCmd.SilenceUsage {
		t.Error("rootCmd.SilenceUsage should be true")
	}
}

func TestRootCmd_SilenceErrors(t *testing.T) {
	if !rootCmd.SilenceErrors {
		t.Error("rootCmd.SilenceErrors should be true")
	}
}


func TestRootCmd_ContextFlag_UnknownContext_ErrorContainsNotFound(t *testing.T) {
	yaml := `
current_context: prod
contexts:
  prod:
    elasticsearch:
      url: https://prod.es.io
  staging:
    elasticsearch:
      url: https://staging.es.io
`
	configPath := cmdtest.TempConfigFile(t, []byte(yaml))
	t.Setenv("ELASTIC_CONFIG", configPath)

	rootCmd.SetArgs([]string{"version", "--context=bogus"})
	t.Cleanup(func() { rootCmd.SetArgs(nil) })

	err := rootCmd.Execute()
	if err == nil {
		t.Fatal("expected error for unknown context, got nil")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q should contain 'not found'", err.Error())
	}
}