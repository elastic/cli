# Data Model: JSON Input Support

## Entities

### CommandConfig (modified)

Existing interface with one new field:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Command name |
| description | string | yes | Help text description |
| options | OptionDefinition[] | no | CLI option definitions |
| handler | (parsed: ParsedResult) => void \| Promise\<void\> | yes | Command handler |
| **input** | **boolean** | **no** | **When true, enables JSON input via `--file` and stdin** |

**Validation rules**:
- When `input` is `true`, no entry in `options` may have `long === 'file'` (collision guard)
- Default: `undefined` / `false` (no JSON input support)

### ParsedResult (modified)

Existing interface with one new field:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| options | Record\<string, string \| number \| boolean\> | yes | Parsed CLI options |
| config | ResolvedConfig | no | Resolved context configuration |
| **input** | **unknown** | **no** | **Parsed JSON from `--file` or stdin; undefined if no input provided** |

**Identity/uniqueness**: Not applicable — `ParsedResult` is an ephemeral value object created per command invocation.

**Lifecycle**: Created inside `defineCommand`'s action handler → passed to `config.handler` → discarded after handler returns.

### Relationships

```
CommandConfig --[defines]--> Command (via defineCommand)
    |
    +-- input: true  -->  registers --file option
                          enables stdin detection
                          |
                          v
                     ParsedResult.input = JSON.parse(content)
```

No persistent state, no state transitions. JSON input is read, parsed, and passed through in a single synchronous flow within the action handler.
