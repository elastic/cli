package client

import (
	"encoding/base64"
	"errors"
	"strings"

	"github.com/elastic/cli/internal/config"
)

func authorizationHeaderFromContext(ctx config.Context) (string, error) {
	if apiKey := strings.TrimSpace(ctx.APIKey); apiKey != "" {
		return "ApiKey " + apiKey, nil
	}
	username := strings.TrimSpace(ctx.Username)
	password := strings.TrimSpace(ctx.Password)
	if username != "" && password != "" {
		token := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
		return "Basic " + token, nil
	}
	return "", errors.New("context missing authentication; set api_key or username/password")
}
