---
description: Set up tab completion for the Elastic CLI in Bash, Zsh, Fish, or PowerShell.
applies_to:
  stack: preview
  serverless: preview
type: how-to
---

# Set up shell completion for the Elastic CLI

`elastic completion <shell>` prints a wrapper script that hooks the CLI into your shell's tab-completion system. Bash, Zsh, Fish, and PowerShell are supported.

The wrapper is dynamic: each `<tab>` shells out to `elastic` to ask which candidates apply, so completions stay in sync with the installed CLI version and include context names from your config file.

## Bash

```bash
# System-wide (writable by root):
elastic completion bash | sudo tee /etc/bash_completion.d/elastic > /dev/null

# Per-user (no sudo required):
mkdir -p ~/.local/share/bash-completion/completions
elastic completion bash > ~/.local/share/bash-completion/completions/elastic
```

Then open a new shell.

## Zsh

```bash
# Drop the script into the first directory in $fpath:
elastic completion zsh > "${fpath[1]}/_elastic"

# Make sure compinit is enabled in ~/.zshrc:
autoload -Uz compinit && compinit
```

Or, for a one-shot install in the current session:

```bash
eval "$(elastic completion zsh)"
```

## Fish

```fish
elastic completion fish > ~/.config/fish/completions/elastic.fish
```

Fish picks up new completion files automatically.

## PowerShell

```powershell
elastic completion powershell | Out-File -Encoding utf8 -Append $PROFILE
```

Then open a new PowerShell session.

## What gets completed

- Top-level commands and groups (`stack`, `cloud`, `docs`, `config`, …)
- Nested subcommands at every depth
- Long option flags (`--json`, `--use-context`, command-specific options)
- Context names for `--use-context` (read from the active config file)
- The `es` / `kb` aliases work identically to the canonical `stack es` / `stack kb` forms

Completion respects the active `commands.allowed` / `commands.blocked` policy: commands you have restricted yourself out of do not appear as candidates.
