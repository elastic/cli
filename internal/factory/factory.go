package factory

import (
	"fmt"
	"io"
	"os"
	"sort"

	apperrors "github.com/elastic/cli/internal/errors"
	"github.com/elastic/cli/internal/output"
	"github.com/spf13/cobra"
)

// RunFunc is the handler type that every subcommand implements.
// The factory calls it after fully populating RunContext.
// The first return value is the data payload written to output; the second is
// any error that occurred. Both nil is valid (produces a null data envelope).
type RunFunc func(ctx RunContext) (any, error)

// RunContext is the per-invocation execution context passed to every handler.
type RunContext struct {
	// Config is the full configuration loaded from disk (or zero-value defaults).
	Config Config

	// ConfigPath is the resolved filesystem path of the loaded config file.
	// Empty string when no config file was found and defaults are in use.
	ConfigPath string

	// ActiveContext is the resolved context name for this invocation.
	// Set from the --context flag if provided; otherwise from Config.CurrentContext.
	ActiveContext string

	// Body is the raw JSON request body supplied by the caller, either piped via
	// stdin or read from the path given to --file. Nil when no input was provided.
	// Validation and schema-based transformation are handled by a later layer.
	Body []byte
}

// New creates a fully wired *cobra.Command from a name, short description, and handler.
//
// When the command runs, New's RunE:
//  1. Resolves the config file path ($ELASTIC_CONFIG → $XDG_CONFIG_HOME →
//     ~/.config/elastic/config.yml → %APPDATA%\elastic\config.yml on Windows).
//  2. Reads and parses the file. Unknown YAML fields are silently ignored.
//     A missing file is not an error — a zero-value Config is used instead.
//  3. Resolves ActiveContext from the --context persistent flag (if set and
//     non-empty) or falls back to Config.CurrentContext.
//  4. Renders a context_not_found error envelope if --context names an unknown context.
//  5. Reads the request body from --file or piped stdin (see readBody).
//  6. Renders an input_error envelope if both --file and piped stdin provide data.
//  7. Calls run with the fully populated RunContext.
//
// All errors (config, context, input, and RunFunc errors) are handled inside
// RunE via output.Render and written to cmd.OutOrStdout(). In JSON mode Render
// writes the error envelope and returns nil, so Cobra never sees the error. In
// text mode Render returns the error so that executeRoot can write it to stderr.
// No os.Exit calls appear inside this package.
func New(name, description string, run RunFunc) *cobra.Command {
	cmd := &cobra.Command{
		Use:   name,
		Short: description,
		RunE: func(cmd *cobra.Command, args []string) error {
			// Resolve output format first so ALL errors can be routed through Render.
			format := output.FormatText
			if f := cmd.Root().PersistentFlags().Lookup("format"); f != nil {
				if v := f.Value.String(); v != "" {
					if err := output.ValidateFormat(v); err != nil {
						return output.Render(cmd.OutOrStdout(), output.FormatJSON, nil,
							&apperrors.InvalidArgumentError{Cause: fmt.Errorf("unsupported format %q: supported values are %q and %q", v, output.FormatText, output.FormatJSON)})
					}
					format = v
				}
			}

			path, err := resolveConfigPath()
			if err != nil {
				return output.Render(cmd.OutOrStdout(), format, nil, &apperrors.ConfigError{Cause: err})
			}

			cfg, err := Load(path)
			if err != nil {
				return output.Render(cmd.OutOrStdout(), format, nil, &apperrors.ConfigError{Cause: err})
			}

			// ConfigPath is empty when the file was not found (defaults in use).
			configPath := path
			if _, statErr := os.Stat(path); os.IsNotExist(statErr) {
				configPath = ""
			}

			// Resolve active context: --context flag takes precedence over
			// Config.CurrentContext. Use Lookup so this is safe when the flag
			// is not registered (e.g. in tests without a wired root).
			activeContext := cfg.CurrentContext
			if f := cmd.Root().PersistentFlags().Lookup("context"); f != nil {
				if contextName := f.Value.String(); contextName != "" {
					if _, ok := cfg.Contexts[contextName]; !ok {
						keys := make([]string, 0, len(cfg.Contexts))
						for k := range cfg.Contexts {
							keys = append(keys, k)
						}
						sort.Strings(keys)
						return output.Render(cmd.OutOrStdout(), format, nil, &apperrors.ContextNotFoundError{Name: contextName, Available: keys})
					}
					activeContext = contextName
				}
			}

			body, err := readBody(cmd)
			if err != nil {
				return output.Render(cmd.OutOrStdout(), format, nil, &apperrors.InputError{Cause: err})
			}

			ctx := RunContext{
				Config:        cfg,
				ConfigPath:    configPath,
				ActiveContext: activeContext,
				Body:          body,
			}

			data, runErr := run(ctx)
			var outErr output.OutputError
			if runErr != nil {
				outErr = &apperrors.CommandError{Cause: runErr}
			}
			return output.Render(cmd.OutOrStdout(), format, data, outErr)
		},
	}
	cmd.Flags().String("file", "", "Path to an input JSON file")
	return cmd
}

// readBody resolves the request body for a command invocation.
//
// Resolution rules:
//  1. If --file is set, read the file. Return an error if it cannot be read.
//  2. If stdin is not a TTY (i.e. it is piped or redirected), read it.
//  3. If both --file and non-TTY stdin provide data, return an error.
//  4. Empty input (zero bytes from either source) yields a nil body.
func readBody(cmd *cobra.Command) ([]byte, error) {
	filePath, _ := cmd.Flags().GetString("file")

	stdinReader := cmd.InOrStdin()
	stdinIsPipe := !isReaderTTY(stdinReader)

	if filePath != "" && stdinIsPipe {
		// Confirm stdin actually has data before rejecting the call.
		stdinBytes, err := io.ReadAll(stdinReader)
		if err != nil {
			return nil, fmt.Errorf("read stdin: %w", err)
		}
		if len(stdinBytes) > 0 {
			return nil, fmt.Errorf("cannot use both stdin and --file as input; provide only one")
		}
	}

	if filePath != "" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("read --file %q: %w", filePath, err)
		}
		if len(data) == 0 {
			return nil, nil
		}
		return data, nil
	}

	if stdinIsPipe {
		data, err := io.ReadAll(stdinReader)
		if err != nil {
			return nil, fmt.Errorf("read stdin: %w", err)
		}
		if len(data) == 0 {
			return nil, nil
		}
		return data, nil
	}

	return nil, nil
}

// isReaderTTY reports whether r is an interactive terminal.
// Any reader that is not an *os.File with ModeCharDevice set is treated as a
// pipe or buffer (i.e. not a TTY), which is the right default for test-injected
// readers such as bytes.Buffer or strings.Reader.
func isReaderTTY(r io.Reader) bool {
	f, ok := r.(*os.File)
	if !ok {
		return false
	}
	info, err := f.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
}
