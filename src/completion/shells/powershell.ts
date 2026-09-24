/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PowerShell completion wrapper for the `elastic` CLI.
 *
 * The wrapper is dynamic: every TAB press shells out to
 * `elastic __complete -- <words>`. The CLI returns candidates followed by a
 * trailing `:N` directive line (see `enumerate.ts`).
 *
 * Install (current user):
 *   elastic completion powershell | Out-File -Encoding utf8 -Append $PROFILE
 */
export function powershellWrapper (): string {
  const lines = [
    '# elastic shell completion (PowerShell)',
    '# Install (current user):',
    '#   elastic completion powershell | Out-File -Encoding utf8 -Append $PROFILE',
    '',
    'Register-ArgumentCompleter -Native -CommandName elastic -ScriptBlock {',
    '    param($wordToComplete, $commandAst, $cursorPosition)',
    '    $elems = @($commandAst.CommandElements | Select-Object -Skip 1)',
    '    $compArgs = @()',
    '    foreach ($el in $elems) { $compArgs += "$el" }',
    '    if ($wordToComplete -eq "" -and ($compArgs.Count -eq 0 -or $compArgs[-1] -ne "")) { $compArgs += "" }',
    '    $response = & elastic __complete -- @compArgs 2>$null',
    '    if (-not $response) { return }',
    '    $lines = @($response -split "`n")',
    '    if ($lines[-1] -match "^:(.+)$") {',
    '        $lines = $lines[0..([Math]::Max(0, $lines.Length - 2))]',
    '    }',
    '    foreach ($line in $lines) {',
    '        $line = $line.TrimEnd("`r")',
    '        if ($line -eq "") { continue }',
    '        [System.Management.Automation.CompletionResult]::new($line, $line, "ParameterValue", $line)',
    '    }',
    '}',
    '',
  ]
  return lines.join('\n')
}
