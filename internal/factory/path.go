package factory

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// resolveConfigPath resolves the Elasticsearch CLI config file path based on
// environment variables and OS conventions.
//
// Resolution precedence:
// 1. $ELASTIC_CONFIG (if set, file must exist)
// 2. $XDG_CONFIG_HOME/elastic/config.yml (all platforms)
// 3. %APPDATA%\elastic\config.yml (Windows fallback)
// 4. ~/.config/elastic/config.yml (Linux/macOS fallback)
//
// If $ELASTIC_CONFIG is set, a missing file is a hard error.
// For other paths, a missing file is not an error — the caller falls back to defaults.
func resolveConfigPath() (string, error) {
	if elasticConfig := os.Getenv("ELASTIC_CONFIG"); elasticConfig != "" {
		if _, err := os.Stat(elasticConfig); err != nil {
			return "", fmt.Errorf("$ELASTIC_CONFIG path not found: %w", err)
		}
		return elasticConfig, nil
	}

	if xdgConfigHome := os.Getenv("XDG_CONFIG_HOME"); xdgConfigHome != "" {
		return filepath.Join(xdgConfigHome, "elastic", "config.yml"), nil
	}

	if runtime.GOOS == "windows" {
		appdata := os.Getenv("APPDATA")
		if appdata == "" {
			return "", fmt.Errorf("APPDATA environment variable not set on Windows")
		}
		return filepath.Join(appdata, "elastic", "config.yml"), nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("could not determine home directory: %w", err)
	}
	return filepath.Join(homeDir, ".config", "elastic", "config.yml"), nil
}
