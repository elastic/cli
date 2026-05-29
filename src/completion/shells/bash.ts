/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bash completion wrapper for the `elastic` CLI.
 *
 * The wrapper is dynamic: every TAB press shells out to
 * `elastic __complete -- <words>`. The CLI returns candidates followed by a
 * trailing `:N` directive line (bit-field; see `enumerate.ts`).
 *
 * Install:
 *   elastic completion bash > /etc/bash_completion.d/elastic
 * or (per-user):
 *   elastic completion bash > ~/.local/share/bash-completion/completions/elastic
 */
export function bashWrapper (): string {
  return `# elastic shell completion (Bash)
# Source this file, or place it under /etc/bash_completion.d/ for system-wide
# install (or ~/.local/share/bash-completion/completions/ for per-user).

_elastic_complete() {
  local args response directive line
  local -a lines
  COMPREPLY=()

  # Words after the program name, up to and including the cursor word.
  args=("\${COMP_WORDS[@]:1:COMP_CWORD}")

  # "--" disables option parsing on the CLI side so flags like --use-context
  # are passed through verbatim.
  response=$(elastic __complete -- "\${args[@]}" 2>/dev/null) || return

  if [[ -z "$response" ]]; then
    return
  fi

  # Split response by newline. readarray requires Bash 4+.
  readarray -t lines <<<"$response"

  directive=0
  if (( \${#lines[@]} > 0 )); then
    local last="\${lines[\${#lines[@]}-1]}"
    if [[ "$last" == :* ]]; then
      directive="\${last#:}"
      unset 'lines[\${#lines[@]}-1]'
    fi
  fi

  for line in "\${lines[@]}"; do
    [[ -z "$line" ]] && continue
    COMPREPLY+=("$line")
  done

  # Bit 1: do not append a trailing space (used for --flag= form).
  if (( (directive & 1) != 0 )); then
    compopt -o nospace 2>/dev/null
  fi

  # Bit 2 (NO_FILE_COMP) is the default for "complete -F"; no action required.
}

complete -F _elastic_complete elastic
`
}
