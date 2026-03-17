package cmd

import (
	"github.com/elastic/cli/internal/cmdutil"
	"github.com/spf13/cobra"
)

// commandSpec configures a cobra.Command built via newCommand. It covers the
// fields needed by the majority of commands so that cobra does not need to be
// imported directly in most command files.
type commandSpec struct {
	Use          string
	Short        string
	Long         string
	Aliases      []string
	Args         cobra.PositionalArgs
	SilenceUsage bool
	// NoDryRun disables the --dry-run flag. By default, --dry-run is registered
	// and HandleDryRun is called inside RunE before dispatching to the inner handler.
	NoDryRun bool
	RunE     func(cmd *cobra.Command, args []string) error
}

// newCommand builds a *cobra.Command from spec. --dry-run is registered by
// default; set spec.NoDryRun to disable it.
func newCommand(spec commandSpec) *cobra.Command {
	cmd := &cobra.Command{
		Use:          spec.Use,
		Short:        spec.Short,
		Long:         spec.Long,
		Aliases:      spec.Aliases,
		Args:         spec.Args,
		SilenceUsage: spec.SilenceUsage,
	}

	if !spec.NoDryRun {
		cmd.Flags().Bool("dry-run", false, "Print resolved command payload and exit without executing")
	}

	inner := spec.RunE
	hasDryRun := !spec.NoDryRun
	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		if hasDryRun {
			dryRun, err := cmdutil.HandleDryRun(cmd, rootFormat, cmd.OutOrStdout())
			if err != nil || dryRun {
				return err
			}
		}
		return inner(cmd, args)
	}

	return cmd
}
