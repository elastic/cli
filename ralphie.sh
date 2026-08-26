#!/usr/bin/env bash

set -euo pipefail

while true; do

  # Run the functional KB tests, bailing on the first failure. Capture combined
  # output so the exact failure can be handed to pi.
  if OUTPUT=$(npm run test:functional:kb -- --bail 2>&1); then
    echo "$OUTPUT"
    echo "all tests passed"
    break
  fi

  echo "$OUTPUT"

  prompt="running \`npm run test:functional:kb -- --bail\` exited non-zero on the first failing test. below is its full output. diagnose and fix ONLY the exact error that caused this failure, then stop. **DO NOT** fix in the .sh file; either fix it in ./codegen/functional/kb.ts and related files, OR in the YAML definition in ./test/functional/kb/definitions/.

  Then, identify if any other tests are going to fail for the exact same reason, and apply the same fix.

**YOU CAN ONLY EDIT TESTS OR TEST CODEGEN.** if the fix is in CLI code itself, add a 'skip' rule in codegen/functional/kb.ts for the test definitions that all suffer this problem, with a comment explaining why they are broken, then stop.

**do not** fix unrelated issues, **do not** refactor, **do not** touch other tests, **DO NOT** run the tests yourself.

# test runner output:

$OUTPUT"

  jj new -m "fix: functional kb test failure"
  pi --model "anthropic/claude-opus-4-8" --thinking medium -p "$prompt"
done
