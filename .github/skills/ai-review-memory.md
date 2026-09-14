# AI review memory

Rejected findings. Do not repeat these.

<!-- processed-through: 5666619416 -->

- 2026-09-14: /review-no already fixed. canonicalPath strips ., empty segments, and .. before prefix checks. Do not re-flag ./ or a double slash as a write bypass. | isGeneratedPath and isProtectedWritePath match the raw path, while isSafeReadPath only normalizes for the .. check. ./.github/workflows/pwn.yml therefore passes isSafeWritePath.
- 2026-09-14: /review-no already fixed. Checkout is pinned to default_branch. Propose and apply are split; the apply job has no model key. | This step is named Checkout default branch tools but has no ref, so on pull_request_review it checks out the PR merge commit.
- 2026-09-14: /review-no the ./ prefix claim. isGeneratedPath and isProtectedWritePath already run canonicalPath first. Do not repeat that. The symlink write through case is still open. | isGeneratedPath / isProtectedWritePath match the raw string and never normalize. ./.github/workflows/ci.yml passes isSafeWritePath.
