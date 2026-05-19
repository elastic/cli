/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fish completion wrapper for the `elastic` CLI.
 *
 * Install (per-user):
 *   elastic completion fish > ~/.config/fish/completions/elastic.fish
 *
 * Fish's `complete -c <cmd> -f` disables filename completion by default, so
 * the `DIRECTIVE_NO_FILE_COMP` bit is implicit. The `DIRECTIVE_NO_SPACE`
 * bit is not honoured (fish only avoids trailing space for `--flag=value`
 * candidates emitted as a single token).
 */
export function fishWrapper (): string {
  return `# elastic shell completion (Fish)

function __elastic_complete
  set -l raw_tokens (commandline -opc) (commandline -ct)

  # Drop the program name (first token) — the CLI's __complete handler expects
  # to receive just the words to complete.
  set -l args $raw_tokens[2..-1]

  set -l response (command elastic __complete -- $args 2>/dev/null)

  set -l count (count $response)
  if test $count -eq 0
    return
  end

  # Trim the trailing ":N" directive line if present.
  set -l last $response[-1]
  if string match -q ':*' -- $last
    if test $count -gt 1
      set response $response[1..-2]
    else
      set response
    end
  end

  for line in $response
    if test -n "$line"
      echo $line
    end
  end
end

complete -c elastic -f -a '(__elastic_complete)'
`
}
