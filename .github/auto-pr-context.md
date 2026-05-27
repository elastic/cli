# Auto PR context — elastic/cli

This repo is the Elastic CLI tool. Source code lives under `packages/` with one package per CLI command group.

## File layout

- `packages/` — CLI command implementations (TypeScript)
- `codegen/` — code generation utilities
- `docs/` — documentation

## Fix conventions

- Only modify files under `packages/` unless the issue explicitly mentions another directory
- Follow existing TypeScript patterns in the affected package
- Do not modify generated files or `dist/`

## Search hints

Command names, flag names, or error messages in the issue body map to files in `packages/`.

## Post-fix steps

After making any changes that add, remove, or update npm dependencies (i.e. changes to `package.json`), run `node scripts/generate-notice.mjs` to regenerate `NOTICE.txt` and include it in the same commit.
