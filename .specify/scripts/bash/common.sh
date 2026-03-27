#!/usr/bin/env bash
# Common functions and variables for all scripts

# Get repository root, with fallback for non-git repositories
get_repo_root() {
    if git rev-parse --show-toplevel >/dev/null 2>&1; then
        git rev-parse --show-toplevel
    else
        # Fall back to script location for non-git repos
        local script_dir="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        (cd "$script_dir/../../.." && pwd)
    fi
}

# Get current feature identifier via the get_current_feature hook.
# The hook determines the identifier from VCS (e.g., git branch name) or environment.
get_current_branch() {
    run_hook get_current_feature
}

# Check if VCS is available and ready via the verify_vcs_ready hook.
# The hook validates that the VCS (git, etc.) is initialized and accessible.
has_git() {
    run_hook verify_vcs_ready >/dev/null 2>&1
}

check_feature_branch() {
    local branch="$1"
    local has_git_repo="$2"

    # For non-git repos, we can't enforce branch naming but still provide output
    if [[ "$has_git_repo" != "true" ]]; then
        echo "[specify] Warning: Git repository not detected; skipped branch validation" >&2
        return 0
    fi

    if [[ ! "$branch" =~ ^[0-9]{3}- ]]; then
        echo "ERROR: Not on a feature branch. Current branch: $branch" >&2
        echo "Feature branches should be named like: 001-feature-name" >&2
        return 1
    fi

    return 0
}

get_feature_dir() { echo "$1/specs/$2"; }

# Find feature directory using the get_feature_dir hook.
# The hook constructs the directory path given the repo root and feature identifier.
# This allows different VCS systems to use different naming conventions.
find_feature_dir_by_prefix() {
    local repo_root="$1"
    local feature_id="$2"
    
    # Use the hook to get the feature directory path
    local feature_dir
    feature_dir=$(run_hook get_feature_dir "repo_root=$repo_root" "feature_id=$feature_id")
    
    # Return the computed path (may or may not exist yet)
    echo "$feature_dir"
}

get_feature_paths() {
    local repo_root=$(get_repo_root)
    local current_branch=$(get_current_branch)
    local has_git_repo="false"

    if has_git; then
        has_git_repo="true"
    fi

    # Use the hook to find feature directory
    local feature_dir=$(find_feature_dir_by_prefix "$repo_root" "$current_branch")

    cat <<EOF
REPO_ROOT='$repo_root'
CURRENT_BRANCH='$current_branch'
HAS_GIT='$has_git_repo'
FEATURE_DIR='$feature_dir'
FEATURE_SPEC='$feature_dir/spec.md'
IMPL_PLAN='$feature_dir/plan.md'
TASKS='$feature_dir/tasks.md'
RESEARCH='$feature_dir/research.md'
DATA_MODEL='$feature_dir/data-model.md'
QUICKSTART='$feature_dir/quickstart.md'
CONTRACTS_DIR='$feature_dir/contracts'
EOF
}

check_file() { [[ -f "$1" ]] && echo "  ✓ $2" || echo "  ✗ $2"; }
check_dir() { [[ -d "$1" && -n $(ls -A "$1" 2>/dev/null) ]] && echo "  ✓ $2" || echo "  ✗ $2"; }

#==============================================================================
# Hook system
#==============================================================================

# Parse command list for a named hook from .specify/hooks.yml.
# Prints one raw command per line (before variable substitution).
_get_hook_commands() {
    local hook_name="$1"
    local hooks_file
    hooks_file="$(get_repo_root)/.specify/hooks.yml"
    [[ -f "$hooks_file" ]] || return 0

    local in_hooks_section=false in_hook=false
    while IFS= read -r line; do
        # skip comments and blank lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue

        if [[ "$line" == "hooks:" ]]; then in_hooks_section=true; continue; fi
        [[ "$in_hooks_section" == false ]] && continue

        # named hook entry (2-space indent)
        if [[ "$line" =~ ^[[:space:]]{2}([a-zA-Z_][a-zA-Z0-9_]*):[[:space:]]*$ ]]; then
            [[ "${BASH_REMATCH[1]}" == "$hook_name" ]] && in_hook=true || in_hook=false
            continue
        fi

        # command list item under the active hook (4-space indent + "- ")
        if [[ "$in_hook" == true ]] && [[ "$line" =~ ^[[:space:]]{4}-[[:space:]]+(.*) ]]; then
            local cmd="${BASH_REMATCH[1]}"
            # strip surrounding double quotes only when the entire value is quoted
            if [[ "$cmd" == \"*\" ]]; then
                cmd="${cmd:1:${#cmd}-2}"
            fi
            echo "$cmd"
        fi
    done < "$hooks_file"
}

# Return true if the named hook has at least one command defined.
hook_defined() {
    [[ -n "$(_get_hook_commands "$1")" ]]
}

# Run all commands for a named hook, substituting {{key}} placeholders.
# Extra arguments must be in key=value form.
# Silently does nothing if the hook is not defined.
run_hook() {
    local hook_name="$1"; shift
    local cmds
    cmds=$(_get_hook_commands "$hook_name")
    [[ -z "$cmds" ]] && return 0
    while IFS= read -r cmd; do
        for kv in "$@"; do
            local key="${kv%%=*}" val="${kv#*=}"
            cmd="${cmd//\{\{$key\}\}/$val}"
        done
        eval "$cmd"
    done <<< "$cmds"
}
