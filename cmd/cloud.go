package cmd

import (
	"fmt"
	"strings"

	"github.com/elastic/cli/internal/client"
	"github.com/elastic/cli/internal/config"
	"github.com/spf13/cobra"
)

var cloudCmd = &cobra.Command{
	Use:   "cloud",
	Short: "Elastic Cloud operations",
}

func init() {
	rootCmd.AddCommand(cloudCmd)
}

func newCloudClient(cloudURL string) (*client.CloudClient, error) {
	ctxCfg, err := selectedContext()
	if err != nil {
		return nil, err
	}
	return client.NewCloudFromContext(ctxCfg, cloudURL)
}

func selectedContext() (config.Context, error) {
	path, err := config.DefaultPath()
	if err != nil {
		return config.Context{}, err
	}
	cfg, err := config.Load(path)
	if err != nil {
		return config.Context{}, err
	}

	ctxName := strings.TrimSpace(rootContext)
	if ctxName == "" {
		ctxName = cfg.CurrentContext
	}
	if ctxName == "" {
		return config.Context{}, fmt.Errorf("no context selected; run `elastic config context set <name> ...` and `elastic config context use <name>`")
	}

	ctxCfg, ok := cfg.Contexts[ctxName]
	if !ok {
		return config.Context{}, fmt.Errorf("context %q not found; run `elastic config context list`", ctxName)
	}
	return ctxCfg, nil
}
