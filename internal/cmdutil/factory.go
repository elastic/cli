package cmdutil

import (
	"context"
	"io"

	"github.com/elastic/cli/internal/config"
	"github.com/spf13/cobra"
)

// RunFunc is the signature for simple command implementations.
// ctx is the command context, args are positional arguments, out is stdout,
// and format is the resolved --format flag value (e.g. "table", "json").
type RunFunc func(ctx context.Context, args []string, out io.Writer, format string) error

// ArgsValidator is the type for positional argument validation.
// Use the predefined values (ArgsAny, ArgsNone) or constructor functions
// (ArgsExact, ArgsMin) to avoid importing cobra directly in command files.
type ArgsValidator = cobra.PositionalArgs

// Predefined ArgsValidator values.
var (
	// ArgsAny accepts any number of positional arguments.
	ArgsAny ArgsValidator = cobra.ArbitraryArgs
	// ArgsNone requires no positional arguments.
	ArgsNone ArgsValidator = cobra.NoArgs
)

// ArgsExact returns an ArgsValidator requiring exactly n positional arguments.
func ArgsExact(n int) ArgsValidator { return cobra.ExactArgs(n) }

// ArgsMin returns an ArgsValidator requiring at least n positional arguments.
func ArgsMin(n int) ArgsValidator { return cobra.MinimumNArgs(n) }

// Spec describes a leaf command to be built by NewCmd.
type Spec struct {
	Use     string
	Short   string
	Aliases []string
	// Args is the positional argument validator. Defaults to ArgsAny if nil.
	Args ArgsValidator
	// NoDryRun disables the --dry-run flag. By default, --dry-run is
	// registered and Run is not invoked for a dry-run execution.
	NoDryRun bool
	Run      RunFunc
}

// NewCmd builds a *cobra.Command from spec. SilenceUsage is always set to true.
// --dry-run is registered by default; set Spec.NoDryRun to disable it.
// HandleDryRun is called before Run; Run is skipped during a dry-run.
func NewCmd(spec Spec) *cobra.Command {
	args := spec.Args
	if args == nil {
		args = cobra.ArbitraryArgs
	}

	cmd := &cobra.Command{
		Use:          spec.Use,
		Short:        spec.Short,
		Aliases:      spec.Aliases,
		Args:         args,
		SilenceUsage: true,
	}

	if !spec.NoDryRun {
		cmd.Flags().Bool("dry-run", false, "Print resolved command payload and exit without executing")
	}

	run := spec.Run
	hasDryRun := !spec.NoDryRun
	cmd.RunE = func(c *cobra.Command, a []string) error {
		format := resolveFormat(c)
		if hasDryRun {
			isDry, err := HandleDryRun(c, format, c.OutOrStdout())
			if err != nil || isDry {
				return err
			}
		}
		return run(c.Context(), a, c.OutOrStdout(), format)
	}

	return cmd
}

// ContextRunFunc is the signature for command implementations that need a
// resolved Elastic config context. cmdCtx is the resolved context from the
// config file; the remaining parameters are the same as RunFunc.
type ContextRunFunc func(ctx context.Context, cmdCtx config.Context, args []string, out io.Writer, format string) error

// ContextSpec describes a leaf command that requires a resolved config context.
// The factory resolves the context before calling Run, so implementations do
// not need to call LookupContext themselves.
type ContextSpec struct {
	Use     string
	Short   string
	Aliases []string
	// Args is the positional argument validator. Defaults to ArgsAny if nil.
	Args ArgsValidator
	// NoDryRun disables the --dry-run flag. By default, --dry-run is
	// registered and Run is not invoked for a dry-run execution.
	NoDryRun bool
	// CfgPath returns the path to the config file.
	// If nil, config.DefaultPath is used.
	CfgPath func() (string, error)
	// CtxFlag returns the --context flag value (empty means use current context).
	CtxFlag func() string
	Run     ContextRunFunc
}

// NewContextCmd builds a *cobra.Command from spec, resolving the Elastic config
// context before invoking Run. SilenceUsage is always set to true.
// --dry-run is registered by default; set ContextSpec.NoDryRun to disable it.
func NewContextCmd(spec ContextSpec) *cobra.Command {
	args := spec.Args
	if args == nil {
		args = cobra.ArbitraryArgs
	}

	cmd := &cobra.Command{
		Use:          spec.Use,
		Short:        spec.Short,
		Aliases:      spec.Aliases,
		Args:         args,
		SilenceUsage: true,
	}

	if !spec.NoDryRun {
		cmd.Flags().Bool("dry-run", false, "Print resolved command payload and exit without executing")
	}

	cfgPathFn := spec.CfgPath
	if cfgPathFn == nil {
		cfgPathFn = config.DefaultPath
	}
	ctxFlagFn := spec.CtxFlag
	if ctxFlagFn == nil {
		ctxFlagFn = func() string { return "" }
	}

	run := spec.Run
	hasDryRun := !spec.NoDryRun
	cmd.RunE = func(c *cobra.Command, a []string) error {
		format := resolveFormat(c)
		if hasDryRun {
			isDry, err := HandleDryRun(c, format, c.OutOrStdout())
			if err != nil || isDry {
				return err
			}
		}
		cfgPath, err := cfgPathFn()
		if err != nil {
			return err
		}
		cmdCtx, err := LookupContext(cfgPath, ctxFlagFn())
		if err != nil {
			return err
		}
		return run(c.Context(), cmdCtx, a, c.OutOrStdout(), format)
	}

	return cmd
}

// NewGroup builds a parent *cobra.Command (no RunE) for grouping subcommands.
func NewGroup(use, short string, aliases ...string) *cobra.Command {
	return &cobra.Command{
		Use:     use,
		Short:   short,
		Aliases: aliases,
	}
}

// resolveFormat reads the --format persistent flag value from cmd or its
// ancestors. Returns "table" if the flag is not found.
func resolveFormat(cmd *cobra.Command) string {
	if f := cmd.Flag("format"); f != nil {
		return f.Value.String()
	}
	return "table"
}
