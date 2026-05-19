/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Zsh completion wrapper for the `elastic` CLI.
 *
 * Install (per-user, recommended):
 *   elastic completion zsh > "\${fpath[1]}/_elastic"
 *   autoload -Uz compinit && compinit
 *
 * Or eagerly:
 *   eval "$(elastic completion zsh)"
 *
 * The wrapper delegates to `elastic __complete -- <words>` on every TAB.
 */
export function zshWrapper (): string {
  return `#compdef elastic
# elastic shell completion (Zsh)

_elastic_complete() {
  local response directive last
  local -a lines candidates flag_args

  # Tokens after the program name, up to and including the cursor word.
  local -a request_args
  request_args=("\${(@)words[2,CURRENT]}")

  response="$(elastic __complete -- "\${request_args[@]}" 2>/dev/null)"

  if [[ -z "$response" ]]; then
    return
  fi

  lines=("\${(@f)response}")

  directive=0
  if (( \${#lines[@]} > 0 )); then
    last="\${lines[-1]}"
    if [[ "$last" == :* ]]; then
      directive="\${last#:}"
      lines=("\${lines[@]:0:\${#lines[@]}-1}")
    fi
  fi

  candidates=()
  local w
  for w in "\${lines[@]}"; do
    [[ -z "$w" ]] && continue
    candidates+=("$w")
  done

  # Bit 1: suppress trailing space (used for --flag= form).
  if (( (directive & 1) != 0 )); then
    compadd -S '' -- "\${candidates[@]}"
  else
    compadd -- "\${candidates[@]}"
  fi
}

compdef _elastic_complete elastic
`
}
