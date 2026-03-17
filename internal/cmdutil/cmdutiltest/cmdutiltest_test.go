package cmdutiltest_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elastic/cli/internal/cmdutil/cmdutiltest"
)

func TestInitUserConfigDir_CreatesConfigFile(t *testing.T) {
	cmdutiltest.InitUserConfigDir(t)
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("os.UserConfigDir: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(cfgDir, "elastic", "config.yaml"))
	if err != nil {
		t.Fatalf("config file not created: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("config file is empty")
	}
}

func TestInitUserConfigDir_ContainsDefaultContext(t *testing.T) {
	cmdutiltest.InitUserConfigDir(t)
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("os.UserConfigDir: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(cfgDir, "elastic", "config.yaml"))
	if err != nil {
		t.Fatalf("config file not created: %v", err)
	}
	content := string(data)
	for _, want := range []string{"current-context: default", "default:", "elasticsearch_url", "api_key"} {
		if !strings.Contains(content, want) {
			t.Errorf("config missing %q:\n%s", want, content)
		}
	}
}

func TestInitUserConfigDir_UniqueDirs(t *testing.T) {
	a := cmdutiltest.InitUserConfigDir(t)
	b := cmdutiltest.InitUserConfigDir(t)
	if a == b {
		t.Error("expected distinct directories for each call")
	}
}
