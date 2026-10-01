# Auto PR context — elastic/cli

Elastic CLI. TypeScript. Commands live under `src/` (`es`, `kb`, `cloud`, `factory`). Tests under `test/`. Functional YAML under `test/functional/`.

## File layout

- `src/` — CLI implementation
- `packages/config-resolver` — config package
- `codegen/` — functional test codegen
- `docs/` — docs
- `.github/workflows/` — CI

## Fix conventions

- Prefer `src/` and `test/`
- Do not edit generated files: `src/es/apis/*.ts`, `src/es/api-manifest.ts`, `src/kb/apis.ts`, `src/kb/api-manifest.ts`
- Do not edit `.github/workflows/`
- After `package.json` changes, run `node scripts/generate-notice.mjs`
- After command or flag changes, run `npm run build:schema` and commit `docs/cli/schema.json`

## Search hints

Command names, flags, and error strings map to `src/` and `test/`.

## Post-fix steps

After making any changes that add, remove, or update npm dependencies (i.e. changes to `package.json`), run `node scripts/generate-notice.mjs` to regenerate `NOTICE.txt` and include it in the same commit.
