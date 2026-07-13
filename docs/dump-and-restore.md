---
description: Export and re-ingest Elasticsearch indices with `elastic es helpers dump` and `bulk-ingest --source-format bulk-ndjson`.
applies_to:
  stack: preview
  serverless: preview
type: guide
---

# Dump and restore an index

`elastic es helpers dump` exports one or more indices as bulk-format NDJSON
(`{"index":{...}}` + `_source` line pairs) using a per-index Point-in-Time
(PIT) and `search_after` sorted by `_shard_doc` for a consistent snapshot.
The output is shaped so it can be piped or passed directly into
`elastic es helpers bulk-ingest --source-format bulk-ndjson`.

Typical use case: capture a remote index for local debugging.

## Example: Remote → local round trip

```bash
# Export from the remote cluster, omit _index so the dump can be re-targeted,
# and filter by a Query DSL clause.
elastic --use-context remote es helpers dump \
  --indices my-prod-idx \
  --skip-index-name \
  --query '{"range":{"@timestamp":{"gte":"now-1h"}}}' \
  --output dump.ndjson

# Re-ingest into the local cluster under a new index name.
elastic --use-context local es helpers bulk-ingest \
  --source-format bulk-ndjson \
  --index local-copy \
  --data-file dump.ndjson
```

Or pipe the two together (be aware that `--use-context` switches mid-pipe via
two separate processes, so each side reads its own active context):

```bash
elastic --use-context remote es helpers dump --indices my-prod-idx --skip-index-name \
  | elastic --use-context local es helpers bulk-ingest --source-format bulk-ndjson --index local-copy
```

## `dump` options

Run `elastic es helpers dump --help` for the full list. The most commonly used:

| Option | Description |
|---|---|
| `--indices <list>` | Comma-separated list of indices to dump. Required. |
| `--size <n>` | Documents per search batch. Default `500`. |
| `--keep-alive <duration>` | Point-in-time keep-alive. Default `1m`. |
| `--output <path>` | Write NDJSON to a file. Omit to stream to stdout. |
| `--skip-index-name` | Omit `_index` from action lines so the dump can be re-targeted at a different index downstream. |
| `--add-id` | Include `_id` in action lines so document IDs round-trip. |
| `--query <json>` | Query DSL clause as an inline JSON string. |
| `--query-file <path>` | Path to a file containing a Query DSL clause. Use `-` to read from stdin. |

## Consistency model

The dump opens a PIT per index and pages through it with `search_after` on
`_shard_doc`. The PIT keeps reads consistent against ongoing writes for the
duration of the dump. If the process is interrupted (`SIGINT`/`SIGTERM`), the
active PIT is closed and the output file is flushed before exit.

If a single dump straddles multiple indices, each index gets its own PIT in
sequence — they are not snapshotted as a group.

## `bulk-ingest --source-format bulk-ndjson`

The companion mode streams pre-formatted action+doc line pairs verbatim into
the `_bulk` API. Behavior differs from the default `ndjson` mode:

- `--index` is **optional**. When omitted, requests go to `/_bulk` and the
  action lines must carry `_index`. When provided, requests go to
  `/{index}/_bulk` and `_index` in the action lines is overridden.
- Only `index` and `create` actions are accepted. `update` (which needs a
  `{"doc": ...}` envelope) and `delete` (which has no paired document line)
  would break the action+doc pair structure and are rejected at parse time.
- `--pipeline` and `--routing` are applied as URL query parameters so they
  affect every action in the batch without rewriting the pre-formatted action
  lines.
- `--flush-bytes`, `--concurrency`, `--retries`, and `--retry-delay` work
  exactly as in the other source formats.
