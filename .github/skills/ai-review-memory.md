# AI review memory

Shared store for rejected AI review findings. `/bad` (OWNER/MEMBER) updates this file on the standing `ai/review-memory` PR. A model writes one "Do not re-flag" line from the finding and the maintainer note. Not an issue hop.

Action items for the next AI review. Follow these. Do not repeat the rejected findings.

<!-- processed-through: 5667056428 -->

- Do not re-flag `./` or a double slash as a write-path bypass. `canonicalPath` strips `.`, empty segments, and `..` before the generated and protected prefix checks.
- Do not re-flag checkout without `ref` on the review repair loop. Checkout is pinned to `default_branch`. Propose and apply are split; the apply job has no model key.
- Do not re-flag `isGeneratedPath` / `isProtectedWritePath` as matching the raw path. They already run `canonicalPath` first.
- Do not re-flag a write guard that only blocks children. The directory itself (`.github`, `.git`, `.buildkite`) is blocked too.
- Do not re-flag skill memory PRs from a fork or from the default branch. Same repo only, and the head must not be `main`.
- Do not re-flag `/stop` as ungated. Only OWNER or MEMBER comment bodies are scanned.
- Do not re-flag an unlabeled skill PR from a human. It needs the `ai-review-memory` label or a `github-actions` author.
- Do not re-flag Buildkite `/stop` as going through the PR-tree repair-loop script. It is a grep on comment bodies.
- Do not re-flag skip-auto-loop as pinning before the first-failure comment. The comment posts first.
- Do not re-flag write protection as workflows-only. All of `.github/` is blocked.
- Do not re-flag sticky comment lookup as a single page. It paginates and takes the first id (CI and Buildkite).
- Do not re-flag skill-PR selection as newest-first list order. Named branch `ai/review-memory` wins, then a skill-only PR, same as `pickSkillMemoryPr`.
- Do not re-flag `workflow_run` as matching the dispatcher by name only. Require `event` and `path` (`review-repair-loop.yml`, `review-no-dispatch.yml`).
- Do not re-flag review-loop concurrency as `workflow_run.id`. It is keyed on `head_branch` so two reviews on the same PR cancel.
- already fixed. Job if requires same-repo head.
