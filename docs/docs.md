# Elastic Docs

The `elastic docs` command family lets you search, read, and ask questions about Elastic documentation directly from your terminal.

## Subcommands

- [`elastic docs search`](#search) — search the Elastic documentation index
- [`elastic docs read`](#read) — read a documentation page rendered in your terminal
- [`elastic docs ask`](#ask) — ask an AI-powered question about Elastic documentation

---

## search

Search the Elastic documentation index.

```bash
elastic docs search <query>
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--page` | `1` | Page number |
| `--size` | `5` | Results per page |
| `--csv` | — | Output results as CSV |

### Examples

```bash
elastic docs search "elasticsearch getting started"
elastic docs search "ingest pipelines" --size 10
elastic docs search "machine learning" --page 2
elastic docs search "APM" --csv
```

Use `--format json` or `--format yaml` for machine-readable output:

```bash
elastic docs search "fleet" -f json
```

---

## read

Read an Elastic documentation page rendered with colours and formatting.

```bash
elastic docs read <path|url|query>
```

The argument can be:

- A docs path: `/reference/elasticsearch`
- A full URL: `https://www.elastic.co/docs/reference/elasticsearch`
- A free-text search query — reads the first matching result

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--raw` | — | Output unrendered markdown instead of formatted output |

### Examples

```bash
elastic docs read /reference/elasticsearch
elastic docs read https://www.elastic.co/docs/reference/elasticsearch
elastic docs read "ingest pipelines"
elastic docs read /reference/elasticsearch --raw
```

---

## ask

Ask an AI-powered question about Elastic documentation and get an answer rendered in your terminal. By default, enters an interactive follow-up loop so you can continue the conversation.

```bash
elastic docs ask <question>
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--once` | — | Return immediately after the first answer (no follow-up prompt) |

### Examples

```bash
elastic docs ask "What is Elasticsearch?"
elastic docs ask "How do I create an ingest pipeline?" --once
elastic docs ask "How do I configure Fleet?"
```

After the first answer, you are prompted for follow-up questions. Press **Enter** (empty input) or **Ctrl+C** to exit the session.
