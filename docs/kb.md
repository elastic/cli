# Kibana (`kb`)

The `elastic kb` command family provides operations against the Kibana API.

## Subcommand groups

- [`elastic kb task-manager`](#task-manager) — Kibana task manager health
- [`elastic kb dashboard`](#dashboard) — dashboard CRUD operations
- [`elastic kb lens`](#lens) — Lens visualization CRUD operations

---

## task-manager

Check Kibana task manager health.

```bash
elastic kb task-manager health
elastic kb task-manager health -f json
```

---

## dashboard

The `elastic kb dashboard` command group lets you list, get, create, delete, and inspect the schema for Kibana dashboards.

### list

List or search dashboards.

```bash
elastic kb dashboard list [search]
```

Aliases: `ls`, `search`

#### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--page` | — | Page number to return |
| `--per-page` | — | Number of dashboards per page |

#### Examples

```bash
# List all dashboards
elastic kb dashboard list

# Search by title substring
elastic kb dashboard list "APM"
elastic kb dashboard ls "logs"

# Paginate
elastic kb dashboard list --page 2 --per-page 20

# Machine-readable output
elastic kb dashboard list -f json
elastic kb dashboard list -f csv
```

---


### get

Get a dashboard by ID.

```bash
elastic kb dashboard get <id>
```

#### Examples

```bash
elastic kb dashboard get 722b74f0-b882-11e8-a6d9-e546fe2bba5f
elastic kb dashboard get <id> -f json
```

---

### delete

Delete a dashboard by ID.

```bash
elastic kb dashboard delete <id>
```

Alias: `rm`

#### Examples

```bash
elastic kb dashboard delete 722b74f0-b882-11e8-a6d9-e546fe2bba5f
elastic kb dashboard rm 722b74f0-b882-11e8-a6d9-e546fe2bba5f
```

---

### create

Create a new dashboard.

```bash
elastic kb dashboard create --title <title>
elastic kb dashboard create --data <json>
```

Supply either `--title` for a minimal empty dashboard, or `--data` with the full JSON request body. Use `--data=-` to read JSON from stdin.

#### Flags

| Flag | Description |
|------|-------------|
| `--title` | Dashboard title (creates a minimal empty dashboard) |
| `--data` | Full JSON request body (use `-` to read from stdin) |

`--title` and `--data` are mutually exclusive; at least one is required.

#### Examples

```bash
# Create a minimal dashboard by title
elastic kb dashboard create --title "My Dashboard"

# Create a dashboard with a full JSON body
elastic kb dashboard create --data '{"data":{"title":"My Dashboard","query":{"query":"","language":"kuery"},"time_range":{"from":"now-15m","to":"now"},"refresh_interval":{"pause":true,"value":60000}}}'

# Create a dashboard from a file
cat body.json | elastic kb dashboard create --data=-

# Output the created dashboard as JSON
elastic kb dashboard create --title "My Dashboard" -f json
```

---

### schema

Get the JSON schema for the dashboard create request body accepted by `--data`.

```bash
elastic kb dashboard schema
```

Use `-f json` or `-f yaml` for the full machine-readable schema.

#### Examples

```bash
# Full schema as JSON
elastic kb dashboard schema -f json

# Full schema as YAML
elastic kb dashboard schema -f yaml
```

---
## lens

The `elastic kb lens` command group lets you list, get, create, delete, and inspect the schema for Kibana Lens visualizations.

### list

List or search Lens visualizations.

```bash
elastic kb lens list [search]
```

Aliases: `ls`, `search`

#### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--page` | — | Page number to return |
| `--per-page` | — | Number of Lens visualizations per page |

#### Examples

```bash
# List all Lens visualizations
elastic kb lens list

# Search by title substring
elastic kb lens list "APM"
elastic kb lens ls "logs"

# Paginate
elastic kb lens list --page 2 --per-page 20

# Machine-readable output
elastic kb lens list -f json
elastic kb lens list -f csv
```

---

### get

Get a Lens visualization by ID.

```bash
elastic kb lens get <id>
```

#### Examples

```bash
elastic kb lens get 722b74f0-b882-11e8-a6d9-e546fe2bba5f
elastic kb lens get <id> -f json
```

---

### delete

Delete a Lens visualization by ID.

```bash
elastic kb lens delete <id>
```

Alias: `rm`

#### Examples

```bash
elastic kb lens delete 722b74f0-b882-11e8-a6d9-e546fe2bba5f
elastic kb lens rm 722b74f0-b882-11e8-a6d9-e546fe2bba5f
```

---

### create

Create a new Lens visualization.

```bash
elastic kb lens create --title <title>
elastic kb lens create --data <json>
```

Supply either `--title` for a minimal Lens visualization, or `--data` with the full JSON request body. Use `--data=-` to read JSON from stdin.

#### Flags

| Flag | Description |
|------|-------------|
| `--title` | Lens visualization title (creates a minimal Lens visualization) |
| `--data` | Full JSON request body (use `-` to read from stdin) |

`--title` and `--data` are mutually exclusive; at least one is required.

#### Examples

```bash
# Create a minimal Lens visualization by title
elastic kb lens create --title "My Lens"

# Create a Lens visualization with a full JSON body
elastic kb lens create --data '{"data":{"title":"My Lens","description":"","visualizationType":"lnsXY"}}'

# Create a Lens visualization from a file
cat body.json | elastic kb lens create --data=-

# Output the created Lens visualization as JSON
elastic kb lens create --title "My Lens" -f json
```

---

### schema

Get the JSON schema for the Lens create request body accepted by `--data`.

```bash
elastic kb lens schema
```

Use `-f json` or `-f yaml` for the full machine-readable schema.

#### Examples

```bash
# Full schema as JSON
elastic kb lens schema -f json

# Full schema as YAML
elastic kb lens schema -f yaml
```

---


## Selecting a context

Use the active context:

```bash
elastic config context use prod
elastic kb dashboard list
```

Override per invocation:

```bash
elastic -c staging kb dashboard list
```

## Output formats

Use `--format` / `-f`:

- `table` (default): terminal table
- `json`: pretty-printed JSON response
- `csv`: CSV with a header row
- `yaml`: YAML output
