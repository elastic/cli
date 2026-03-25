package cmd

import "testing"

func TestRootCmd(t *testing.T) {
	if rootCmd.Use != "elastic" {
		t.Errorf("rootCmd.Use = %q; want %q", rootCmd.Use, "elastic")
	}
	if rootCmd.Short == "" {
		t.Error("rootCmd.Short is empty")
	}
}
