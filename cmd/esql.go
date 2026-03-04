package cmd

import (
	"errors"
	"fmt"
	"strings"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/config"
	"github.com/elastic/cli/internal/output"

	"github.com/spf13/cobra"
)

var esqlShowNull bool

var esQueryCmd = &cobra.Command{
	Use:          "query <query>",
	Short:        "Run an ES|QL query",
	Args:         cobra.ExactArgs(1),
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		query := strings.TrimSpace(args[0])
		if query == "" {
			return errors.New("query is required")
		}

		path, err := config.DefaultPath()
		if err != nil {
			return err
		}
		cfg, err := config.Load(path)
		if err != nil {
			return err
		}

		ctxName := strings.TrimSpace(rootContext)
		if ctxName == "" {
			ctxName = cfg.CurrentContext
		}
		if ctxName == "" {
			return fmt.Errorf("no context selected; run `elastic config context set <name> ...` and `elastic config context use <name>`")
		}

		ctxCfg, ok := cfg.Contexts[ctxName]
		if !ok {
			return fmt.Errorf("context %q not found; run `elastic config context list`", ctxName)
		}

		cl, err := client.NewFromContext(ctxCfg)
		if err != nil {
			return err
		}

		resp, raw, err := cl.ESQLQuery(cmd.Context(), query)
		if err != nil {
			return err
		}

		fmtFormat := output.NormalizeFormat(rootFormat)
		opts := output.RenderOpts{
			OmitNull: !esqlShowNull,
		}
		return output.Render(cmd.OutOrStdout(), fmtFormat, resp, raw, opts)
	},
}

func init() {
	esCmd.AddCommand(esQueryCmd)
	esQueryCmd.Flags().BoolVar(&esqlShowNull, "null", false, "Include null-only columns in output (omitted by default)")
}
