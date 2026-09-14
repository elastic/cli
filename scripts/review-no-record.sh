#!/usr/bin/env bash
# Record a /bad comment onto the standing skill-file PR.
# Expects: GH_TOKEN, GH_REPO, DEFAULT_BRANCH, EVENT_JSON
# Must run from a writable checkout of the default branch.
set -euo pipefail

EVENT_JSON="${EVENT_JSON:?}"
GH_REPO="${GH_REPO:?}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:?}"

SCRIPT=scripts/repair-loop.mjs
if [ ! -f "$SCRIPT" ]; then
  echo "scripts/repair-loop.mjs missing on default branch"
  exit 0
fi
cp "$SCRIPT" /tmp/repair-loop.mjs

if ! node /tmp/repair-loop.mjs review-no-event "$EVENT_JSON" > /tmp/review-no-parsed.json; then
  echo "Invalid review-no event"
  exit 0
fi
SOURCE=$(jq -r '.source' /tmp/review-no-parsed.json)
API_PATH=$(jq -r '.apiPath' /tmp/review-no-parsed.json)
gh api "repos/${GH_REPO}/${API_PATH}" > /tmp/review-no-comment.json

ASSOC=$(jq -r '.author_association // empty' /tmp/review-no-comment.json)
LOGIN=$(jq -r '.user.login // empty' /tmp/review-no-comment.json)
if [ "$LOGIN" = 'github-actions[bot]' ]; then
  echo "Ignoring bot comment"
  exit 0
fi
if [ "$ASSOC" != OWNER ] && [ "$ASSOC" != MEMBER ]; then
  echo "Ignoring untrusted author"
  exit 0
fi

jq -r '.body // empty' /tmp/review-no-comment.json > /tmp/comment.txt
if ! node /tmp/repair-loop.mjs has-bad /tmp/comment.txt; then
  echo "No /bad"
  exit 0
fi

if ! node /tmp/repair-loop.mjs review-comment-pr "$SOURCE" /tmp/review-no-comment.json > /tmp/review-no-pr.json; then
  echo "Could not resolve PR from comment"
  exit 0
fi
PR=$(jq -r '.pr' /tmp/review-no-pr.json)
COMMENT=$(cat /tmp/comment.txt)
IN_REPLY_TO=$(jq -r '.in_reply_to_id // empty' /tmp/review-no-comment.json)
case "$IN_REPLY_TO" in
  ''|[!1-9]*|*[!0-9]*) IN_REPLY_TO="" ;;
esac

FINDING=""
RID=""
if [ -n "$IN_REPLY_TO" ]; then
  FINDING=$(gh api -X GET "repos/${GH_REPO}/pulls/comments/${IN_REPLY_TO}" \
    --jq '.body // empty')
else
  REVIEW=$(gh api -X GET "repos/${GH_REPO}/pulls/${PR}/reviews" \
    --jq '[.[] | select(.user.login == "github-actions[bot]")] | last | {id, body}')
  RID=$(printf '%s' "$REVIEW" | jq -r '.id // empty')
  FINDING=$(printf '%s' "$REVIEW" | jq -r '.body // empty')
fi
case "$RID" in
  ''|[!1-9]*|*[!0-9]*) RID="" ;;
esac
if [ -n "$RID" ]; then
  gh api -X PUT "repos/${GH_REPO}/pulls/${PR}/reviews/${RID}/dismissals" \
    -f message="Maintainer rejected this review (/bad)" \
    -f event=DISMISS || true
fi
ENTRY=$(node /tmp/repair-loop.mjs memory-entry "$COMMENT" "$FINDING")
if [ -z "$ENTRY" ]; then
  echo "Empty memory entry"
  exit 0
fi
gh pr list --state open --limit 50 --json number,headRefName,files,isCrossRepository,labels,author \
  > /tmp/prs.json
HEAD=ai/review-memory
NUM=""
if DEFAULT_BRANCH="$DEFAULT_BRANCH" node /tmp/repair-loop.mjs pick-skill-pr /tmp/prs.json > /tmp/skill-pr.json; then
  HEAD=$(jq -r '.headRefName' /tmp/skill-pr.json)
  NUM=$(jq -r '.number' /tmp/skill-pr.json)
fi
if [ -z "$HEAD" ] || [ "$HEAD" = "$DEFAULT_BRANCH" ]; then
  HEAD=ai/review-memory
  NUM=""
fi
git fetch origin "${HEAD}:${HEAD}" 2>/dev/null || true
if git show-ref --verify --quiet "refs/heads/${HEAD}"; then
  git checkout "$HEAD"
else
  git checkout -B "$HEAD"
fi
SKILL=".github/skills/ai-review-memory.md"
mkdir -p .github/skills
if [ ! -f "$SKILL" ]; then
  : > "$SKILL"
fi
node /tmp/repair-loop.mjs memory-append "$SKILL" "$ENTRY" > /tmp/skill-out.md
if cmp -s "$SKILL" /tmp/skill-out.md; then
  echo "Already recorded"
  exit 0
fi
cp /tmp/skill-out.md "$SKILL"
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add "$SKILL"
git commit -m "docs: record rejected review finding"
git push -u origin "$HEAD"
if [ -z "$NUM" ] || [ "$NUM" = "null" ]; then
  CREATED=$(gh pr create --base "$DEFAULT_BRANCH" --head "$HEAD" \
    --title "docs: update ai review memory" \
    --label ai-review-memory \
    --body "Updates \`.github/skills/ai-review-memory.md\` from \`/bad\`.")
  NUM="${CREATED##*/}"
fi
gh pr comment "$PR" --body "Noted \`/bad\`. Recorded on #${NUM}."
