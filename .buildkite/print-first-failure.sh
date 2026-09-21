#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Runs after functional jobs. Prints the first recorded failure.
# The sticky PR comment is posted by .github/workflows/bk-repair-loop.yml
# after triage when GitHub sees buildkite/elastic-cli/pr fail. GH_TOKEN here is optional.

set -euo pipefail

echo "+++ First Buildkite failure"

SUMMARY=""
if command -v buildkite-agent >/dev/null && buildkite-agent meta-data exists first-failure 2>/dev/null; then
  SUMMARY=$(buildkite-agent meta-data get first-failure)
fi

if [ -z "$SUMMARY" ]; then
  echo "No first-failure metadata. Functional jobs were green, or they failed before recording a FAIL line."
  exit 0
fi

printf '%s\n' "$SUMMARY"

if [ -z "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN unset. Printed only; no PR comment or commit from Buildkite."
  exit 0
fi

PR="${BUILDKITE_PULL_REQUEST:-false}"
if [ "$PR" = "false" ] || [ -z "$PR" ]; then
  echo "Not a pull request build."
  exit 0
fi

export GH_REPO="elastic/cli"

gh api --paginate "repos/${GH_REPO}/issues/${PR}/comments" \
  --jq '.[] | select(.author_association == "OWNER" or .author_association == "MEMBER") | .body // empty' \
  > /tmp/pr-comments.txt || true
STOP_REPAIR=0
if grep -Eq '(^|[[:space:]])(/stop|/stop-repair)([[:space:]]|$)' /tmp/pr-comments.txt; then
  STOP_REPAIR=1
fi

LABELS=$(gh pr view "$PR" --json labels --jq '[.labels[].name] | join(",")' || true)
SKIP_LOOP=0
AUTO_LOOP=0
case ",$LABELS," in *,skip-auto-loop,*) SKIP_LOOP=1 ;; esac
case ",$LABELS," in *,auto-loop,*) AUTO_LOOP=1 ;; esac

COMMENT_TAG='<!-- bk-repair-loop -->'
BODY=$(printf '%s\n' \
  "$COMMENT_TAG" \
  "First Buildkite failure: **${BUILDKITE_LABEL:-functional}**" \
  "" \
  "Build: ${BUILDKITE_BUILD_URL:-}" \
  "" \
  '```' \
  "$SUMMARY" \
  '```')
EXISTING=$(gh api --paginate "repos/${GH_REPO}/issues/${PR}/comments" \
  --jq ".[] | select((.user.login == \"github-actions[bot]\" or .user.login == \"elastic-vault-github-plugin-prod[bot]\") and (.body | startswith(\"${COMMENT_TAG}\"))) | .id" \
  | head -n 1 || true)
if [ -n "$EXISTING" ]; then
  gh api -X PATCH "repos/${GH_REPO}/issues/comments/${EXISTING}" -f body="$BODY"
else
  gh pr comment "$PR" --body "$BODY"
fi

if [ "$STOP_REPAIR" = 1 ] && [ "$SKIP_LOOP" = 0 ]; then
  gh pr edit "$PR" --add-label skip-auto-loop || true
  gh pr comment "$PR" --body "Repair loop stopped (\`/stop\`). Added \`skip-auto-loop\`."
  echo "Stopped by /stop"
  exit 0
fi

if [ "$SKIP_LOOP" = 1 ] || [ "$AUTO_LOOP" != 1 ]; then
  echo "No auto-loop (label skip-auto-loop or missing auto-loop). Comment only."
  exit 0
fi

echo "Posted <!-- bk-repair-loop -->. GitHub Actions bk-repair-loop.yml applies the in-repo fix."
exit 0
