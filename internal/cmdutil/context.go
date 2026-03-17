package cmdutil

import (
	"fmt"
	"os"
	"strings"

	"github.com/elastic/cli/internal/config"
)

// LookupContext loads the config at cfgPath and returns the context named by
// ctxFlag, or cfg.CurrentContext if ctxFlag is empty.
//
// Errors are returned as *StructuredError with one of:
//   - ErrCodeConfigNotFound  — file does not exist at cfgPath
//   - ErrCodeNoContextSelected — no context name could be determined
//   - ErrCodeContextNotFound — the named context is not in the config
func LookupContext(cfgPath, ctxFlag string) (config.Context, error) {
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		return config.Context{}, NewStructuredError(
			ErrCodeConfigNotFound,
			fmt.Sprintf("config file not found: %s", cfgPath),
		)
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		return config.Context{}, WrapError(ErrCodeInternal, err)
	}

	ctxName := strings.TrimSpace(ctxFlag)
	if ctxName == "" {
		ctxName = cfg.CurrentContext
	}
	if ctxName == "" {
		return config.Context{}, NewStructuredError(
			ErrCodeNoContextSelected,
			"no context selected; run `elastic config context set <name>` and `elastic config context use <name>`",
		)
	}

	ctx, ok := cfg.Contexts[ctxName]
	if !ok {
		return config.Context{}, NewStructuredError(
			ErrCodeContextNotFound,
			fmt.Sprintf("context %q not found; run `elastic config context list`", ctxName),
		)
	}

	return ctx, nil
}
