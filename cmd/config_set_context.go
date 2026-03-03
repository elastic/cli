package cmd

import (
	"errors"
	"fmt"
	"strings"

	"github.com/elastic/cli/internal/config"

	"github.com/spf13/cobra"
)

var (
	setContextCloudID          string
	setContextAPIKey           string
	setContextUsername         string
	setContextPassword         string
	setContextElasticsearchURL string
	setContextKibanaURL        string
)

var configSetContextCmd = &cobra.Command{
	Use:   "set <name>",
	Short: "Create or update a context",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := strings.TrimSpace(args[0])
		if name == "" {
			return errors.New("context name is required")
		}

		path, err := config.DefaultPath()
		if err != nil {
			return err
		}

		cfg, err := config.Load(path)
		if err != nil {
			return err
		}

		ctx := cfg.Contexts[name]
		if setContextCloudID != "" {
			ctx.CloudID = strings.TrimSpace(setContextCloudID)
		}
		if setContextAPIKey != "" {
			ctx.APIKey = strings.TrimSpace(setContextAPIKey)
		}
		if setContextUsername != "" {
			ctx.Username = strings.TrimSpace(setContextUsername)
		}
		if setContextPassword != "" {
			ctx.Password = strings.TrimSpace(setContextPassword)
		}
		if setContextElasticsearchURL != "" {
			ctx.ElasticsearchURL = strings.TrimSpace(setContextElasticsearchURL)
		}
		if setContextKibanaURL != "" {
			ctx.KibanaURL = strings.TrimSpace(setContextKibanaURL)
		}

		if ctx.APIKey == "" && (ctx.Username == "" || ctx.Password == "") {
			return errors.New("either --api-key or both --username and --password are required (or set previously for this context)")
		}
		if ctx.ElasticsearchURL == "" && ctx.CloudID == "" {
			return errors.New("either --elasticsearch-url or --cloud-id is required (or set previously for this context)")
		}

		cfg.Contexts[name] = ctx
		if cfg.CurrentContext == "" {
			cfg.CurrentContext = name
		}

		if err := config.Save(path, cfg); err != nil {
			return err
		}

		fmt.Fprintf(cmd.OutOrStdout(), "Context %q saved\n", name)
		return nil
	},
}

func init() {
	configContextCmd.AddCommand(configSetContextCmd)

	configSetContextCmd.Flags().StringVar(&setContextCloudID, "cloud-id", "", "Elastic Cloud ID for the deployment/project")
	configSetContextCmd.Flags().StringVar(&setContextAPIKey, "api-key", "", "Elastic API key (stored in config file)")
	configSetContextCmd.Flags().StringVar(&setContextUsername, "username", "", "Basic auth username (stored in config file)")
	configSetContextCmd.Flags().StringVar(&setContextPassword, "password", "", "Basic auth password (stored in config file)")
	configSetContextCmd.Flags().StringVar(&setContextElasticsearchURL, "elasticsearch-url", "", "Direct Elasticsearch URL (overrides cloud-id-derived URL)")
	configSetContextCmd.Flags().StringVar(&setContextKibanaURL, "kibana-url", "", "Direct Kibana base URL (optional; otherwise derived from cloud-id or elasticsearch-url when possible)")
}
