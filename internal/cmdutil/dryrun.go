package cmdutil

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// HandleDryRun checks whether --dry-run is active on cmd.
// Returns (true, nil) after writing the resolved payload to w when --dry-run is set.
// Returns (false, nil) when --dry-run is not active.
// Returns (false, *StructuredError{ErrCodeDryRunNotSupported}) if the flag is
// not registered on the command.
//
// format is the active output format (e.g. "json", "table"); json emits JSON output.
// w is the writer that receives dry-run output.
func HandleDryRun(cmd *cobra.Command, format string, w io.Writer) (bool, error) {
	f := cmd.Flags().Lookup("dry-run")
	if f == nil {
		return false, &StructuredError{
			Code:    ErrCodeDryRunNotSupported,
			Message: "this command does not support --dry-run",
		}
	}

	if f.Value.String() != "true" {
		return false, nil
	}

	flags := map[string]string{}
	cmd.Flags().VisitAll(func(fl *pflag.Flag) {
		if fl.Name != "dry-run" {
			flags[fl.Name] = fl.Value.String()
		}
	})

	if w != nil {
		if format == "json" {
			payload := struct {
				DryRun struct {
					Command string            `json:"command"`
					Flags   map[string]string `json:"flags"`
				} `json:"dry_run"`
			}{}
			payload.DryRun.Command = cmd.Use
			payload.DryRun.Flags = flags
			b, _ := json.MarshalIndent(payload, "", "  ")
			fmt.Fprintln(w, string(b))
		} else {
			fmt.Fprintf(w, "Dry run: %s\n", cmd.Use)
			for k, v := range flags {
				fmt.Fprintf(w, "  --%s=%s\n", k, v)
			}
		}
	}

	return true, nil
}
