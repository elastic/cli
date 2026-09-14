# AI review memory

Action items for the next AI review. Follow these. Do not repeat the rejected findings.

<!-- processed-through: 5667056428 -->

- Do not re-flag `./` or a double slash as a write-path bypass. `canonicalPath` strips `.`, empty segments, and `..` before the generated and protected prefix checks.
- Do not re-flag checkout without `ref` on the review repair loop. Checkout is pinned to `default_branch`. Propose and apply are split; the apply job has no model key.
- Do not re-flag `isGeneratedPath` / `isProtectedWritePath` as matching the raw path. They already run `canonicalPath` first.
- Do not re-flag a missing author check on `promote-review-memory.yml`. The job requires OWNER, MEMBER, COLLABORATOR, or `github-actions[bot]`, and merge skips outsider lines.
