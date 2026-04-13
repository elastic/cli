# Research: Configuration File Loading

**Date**: 2026-03-30
**Feature**: 002-config-file-loading

## R1: cosmiconfig Configuration Discovery

**Decision**: Use cosmiconfig with application ID `elastic` for config file discovery and loading.

**Rationale**: cosmiconfig is already a project dependency. It provides cross-platform config file discovery with a well-defined search order, built-in YAML/JSON/JS loader support, and caching. Using the ID `elastic` means cosmiconfig will search for files like `.elasticrc`, `.elasticrc.yml`, `.elasticrc.yaml`, `.elasticrc.json`, `elastic.config.js`, and a `"elastic"` key in `package.json`. The `searchPlaces` option can be customized to restrict to YAML-only if needed.

**Alternatives considered**:
- Manual `fs.existsSync` search: More code, no caching, would need to replicate cosmiconfig's cross-platform path logic. Rejected — reinvents the wheel.
- Custom search with `yaml` package for parsing: Possible but cosmiconfig already uses built-in YAML loading for `.yml`/`.yaml` extensions. The `yaml` package in `package.json` is available as a fallback but not needed for basic YAML parsing — cosmiconfig handles it natively.

## R2: Zod Schema Design for Config Validation

**Decision**: Define Zod schemas that mirror the config file structure: a root schema with `current-context` (string) and `contexts` (array of context objects). Each context has a `name` and optional service blocks (`elasticsearch`, `kibana`, `cloud`). Each service block has `url` (string) and `auth` (discriminated union of API key or username/password). Use `.passthrough()` on object schemas to silently ignore unknown fields. Use `z.coerce` for type coercion where needed.

**Rationale**: Zod is already in the project and used in `factory.ts` for number coercion. Zod 4's `.passthrough()` directly implements the "ignore unknown fields" requirement. Discriminated unions cleanly model the two auth types. Zod's `.parse()` produces typed output directly, eliminating the need for separate type definitions — types can be inferred via `z.infer<>`.

**Alternatives considered**:
- JSON Schema with ajv: Would add a new dependency. Rejected per Constitution VI.
- Manual validation: Error-prone, no type inference. Rejected.

## R3: Auth Credential Schema Shape

**Decision**: Model auth as a discriminated union with a `type` field:
- `{ type: 'apiKey', apiKey: string }` — single API key string
- `{ type: 'basic', username: string, password: string }` — username/password pair

**Rationale**: A `type` discriminator makes validation unambiguous and enables Zod's `z.discriminatedUnion()` for clear error messages when auth is misconfigured. The field names (`apiKey`, `username`, `password`) are self-documenting.

**Alternatives considered**:
- Infer auth type from which fields are present (no discriminator): Ambiguous when both are partially present. Rejected for clarity.
- Separate `auth-type` top-level field per context: Would separate related data. Rejected.

## R4: Config Resolution Pipeline

**Decision**: The config loading pipeline follows this sequence:
1. **Discover**: cosmiconfig searches for config (or uses `--config` flag path)
2. **Parse**: cosmiconfig parses YAML → raw JS object
3. **Validate**: Zod schema `.parse()` validates and coerces the raw object
4. **Resolve**: Extract the active context (from `--context` flag or `current-context` field), strip all other contexts, compute any derived values
5. **Return**: Typed `ResolvedConfig` object passed to handler

**Rationale**: Separating validation from resolution keeps each step testable. cosmiconfig handles steps 1-2. Zod handles step 3. Step 4 is custom logic operating on validated, typed data.

**Alternatives considered**:
- Single monolithic function: Hard to test, hard to extend. Rejected.
- Validate after resolution: Would miss validation errors in non-selected contexts (acceptable since we only use the selected one, but validating the full file first catches structural issues early). Decision: validate the full file structure, then resolve.

## R5: Cross-Platform Config File Locations

**Decision**: Use cosmiconfig's default search behavior with ID `elastic`. cosmiconfig searches from CWD upward through parent directories, then checks OS-standard locations via `os.homedir()`. The primary expected file name is `.elasticrc.yml`.

**Rationale**: cosmiconfig already handles cross-platform path resolution using `os.homedir()` and platform-agnostic directory traversal, satisfying Constitution VII. No hard-coded paths needed.

**Alternatives considered**:
- XDG Base Directory spec (`~/.config/elastic/config.yml`): More correct on Linux but adds complexity for Windows/macOS. cosmiconfig's built-in search covers the common case. Can be added later by extending `searchPlaces`.

## R6: Integration with Command Factory

**Decision**: Extend `CommandConfig` and `ParsedResult` in `factory.ts` to include a resolved config object. The `defineCommand` factory will run the config loader before invoking the handler and inject the resolved config into `ParsedResult`. Global `--config` and `--context` options will be registered on the root Commander program in `cli.ts`.

**Rationale**: Centralizing config loading in the factory ensures every command gets config automatically without boilerplate. Global options on the root program are inherited by all subcommands in Commander.js.

**Alternatives considered**:
- Each command loads config independently: Violates DRY, error-prone. Rejected.
- Middleware pattern: Commander.js doesn't have native middleware; using `hook('preAction', ...)` on the root program is the closest equivalent and is effectively what we'll use.
