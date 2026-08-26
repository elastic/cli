# `test:functional:kb` Failure Analysis

Source: `test-output.txt` (run of `npm run test:functional:kb`).

Totals: **215 FAIL / 11 PASS**.

Baseline sanity check: connectivity, auth, base path, and `--json` plumbing are
working. `connectors`, `data_views`, `spaces`, `saved_objects`, `alerting`, and
several `workflows_*` cases pass, so failures are per-feature, not global.

Failures cluster into seven groups. Each group below is tagged
**CLI**, **TEST**, or **ENV**.

| # | Group | Count (approx) | Class |
|---|-------|------|-------|
| 1 | Generic `404 Not Found` on feature routes | ~150 blocks | ENV |
| 2 | Attack Discovery schedules — `404 Saved object [action/…]` in teardown | 8 | ENV + TEST |
| 3 | Raw `input_error` crash on empty path param | 24 | CLI + TEST |
| 4 | Streams — `400 invalid_union` then `404 Cannot find stream` | 15 | TEST |
| 5 | Visualizations / entity-store — `400 expected object, received null` | 51 occ. | TEST (+ CLI option) |
| 6 | Entity Store — `400 Entity Store is not installed` | 7 | ENV + TEST |
| 7 | Workflows — `409` conflicts, `400` invalid workflow, `jq` shape errors | ~15 | TEST + ENV |

---

## Group 1 — Generic `404 Not Found` on feature routes (ENV)

Affected areas: `security_detections_api_*`, `security_endpoint_exceptions_api_*`,
`security_endpoint_management_api_*`, `security_entity_analytics_api_*`,
`security_exceptions_api_*`, `security_lists_api_*`, `security_osquery_api_*`
(the `find/get/list` variants), `security_timeline_api_*`,
`security_solution_initialization_api_*`, `significantevents_*`, `slo_*`.

Signature:

```json
{"error":{"code":"kibana_api_error","status_code":404,
  "message":"Kibana API error 404: {\"statusCode\":404,\"error\":\"Not Found\",\"message\":\"Not Found\"}"}}
```

### Classification: environmental

The `"Not Found"` body is Kibana's generic *route-not-registered* response, not a
saved-object-missing error. Read-only operations that need no seed data
(`find_rules`, `read_privileges`, `read_tags`, `find_slos`, `list_watchlists`,
`find_exception_lists`) still 404. That means the route itself is absent on the
target Kibana, not that a resource is missing. The CLI reports the 404 correctly
as structured JSON — no CLI defect here.

Root cause: the target Kibana does not have the Security Solution, Observability
(SLO), Streams, and related plugins/features enabled for this deployment tier /
license / project type.

### Environment setup to avoid this

- Run against a deployment where the exercised features are enabled:
  - **Security Solution** (detections, exceptions, lists, timeline, endpoint,
    entity analytics, osquery, attack discovery) requires a Security-enabled
    Kibana. On serverless, use a **Security** project; on stateful, an
    Enterprise/Trial license with the Security app enabled.
  - **SLO** and **Streams** require the **Observability** solution enabled
    (serverless **Observability** project, or stateful with Observability + the
    Streams feature flag on the target version).
  - **Osquery** live-query/pack/saved-query routes require the **Osquery Manager**
    integration installed via Fleet.
- Confirm the feature is reachable before running, e.g.:
  ```
  elastic stack kb security-detections-api read-privileges --json
  elastic stack kb slo find-slos-op --json
  ```
  A `404 Not Found` here means the plugin is not enabled — fix the environment,
  do not change the CLI.
- If the suite is meant to run against a single deployment that cannot host every
  solution, gate these groups behind a capability probe in the runner so absent
  features are reported as **SKIP**, not **FAIL** (see also Group 7 runner note).

---

## Group 2 — Attack Discovery schedules: `404 Saved object [action/…-connector]` (ENV + TEST)

Affected: `security_attack_discovery_api_*_schedules`, `…_create_…`,
`…_get_…`, `…_update_…`, `…_bulk_*_…`.

Observed tail:

```json
{"error":{"code":"kibana_api_error","status_code":404,
  "message":"…\"Saved object [action/cli-ft-attack-discovery-sched-connector] not found\""}}
```

### Classification: environmental (primary) + test robustness (secondary)

Flow in `security_attack_discovery_api_create_attack_discovery_schedules.sh`:
1. Setup creates a `.gen-ai` connector.
2. The `create-attack-discovery-schedules` call returns generic `404 Not Found`
   (the schedules route is unavailable on this Kibana — same ENV cause as Group 1).
3. `set -e` aborts; the `trap teardown EXIT` fires with an empty `SCHEDULE_ID`
   and deletes the connector. The connector-delete `404 Saved object … not found`
   is the *visible tail* but is a teardown artifact, not the real failure.

### Fixes

- **ENV**: Enable Attack Discovery (Security serverless project / appropriate
  version + a configured Gen-AI connector). Verify:
  `elastic stack kb security-attack-discovery-api find-attack-discovery-schedules --json`.
- **TEST**: Make teardown idempotent and order-independent so cascade noise does
  not mask the real error:
  ```bash
  teardown() {
    [ -n "$SCHEDULE_ID" ] && $ELASTIC … delete-attack-discovery-schedules --yes --id "$SCHEDULE_ID" || true
    $ELASTIC … connectors delete-actions-connector-id --yes --id cli-ft-…-connector || true
  }
  ```
  Guarding empty ids also removes the Group 3 crash on these tests.

---

## Group 3 — Raw `input_error` crash on empty path parameter (CLI + TEST)

Affected: `security_osquery_api_*` (copy/create/delete/get/update packs &
saved queries), `security_endpoint_management_api_endpoint_script_library_*`,
`security_entity_analytics_api_assign_watchlist_entities`, the Attack Discovery
schedule teardowns.

Signature (stderr, not JSON):

```
file:///…/dist/lib/path-encoding.js:4
  throw Object.assign(new Error(`Invalid path parameter "${segment}"…`), { code: 'input_error' });
Error: Invalid path parameter "": empty, ".", and ".." segments are rejected…
    at assertSafePathSegment (…/path-encoding.js:4:29)
    …
Node.js v25.9.0
```

### Classification: CLI defect (primary) + test robustness (secondary)

Two independent problems:

**3a — CLI (real fix).** `assertSafePathSegment` throwing an `input_error` is
correct behavior (empty path segments must be rejected — do **not** relax the
validation), but the error escapes as an **uncaught exception with a Node stack
trace on stderr**. This violates the constitution: with `--json`, every error
MUST serialize as `{"error":{"code":"…","message":"…"}}` on stderr with a
non-zero exit. Path-encoding validation errors are not being routed through the
CLI's top-level error formatter.

Proposed fix: ensure the top-level handler in `dist/cli.js` (source
`src/cli.ts`, around the `parseAsync` catch at cli.js:244) catches thrown errors
carrying `code: 'input_error'` (and validation errors generally) and formats them
via the same path as `kibana_api_error`:

```jsonc
{"error":{"code":"input_error","message":"Invalid path parameter \"\": empty, \".\", and \"..\" segments are rejected…"}}
```

Add a red test: invoke a command whose required path param resolves to `""`
with `--json` and assert (1) exit code non-zero, (2) stdout/stderr is the JSON
error envelope, (3) no `Error:`/stack trace text is emitted.

**3b — TEST.** The empty segment originates because an upstream setup/create
returned an error, leaving the id variable empty; the teardown or a follow-up
call then interpolates `""` into the path. Root causes are Group 1/2 (route 404)
or Group 5 (null-body 400). Guard id variables in teardown (see Group 2) so a
failed setup reports its own cause instead of a downstream path crash.

---

## Group 4 — Streams: `400 invalid_union` then `404 Cannot find stream` (TEST)

Affected: every `streams_*` case (`get/put/delete/post …_name`, `…_ingest`,
`…_query`, `…_attachments*`, `…_fork`, `…_content_*`).

The setup `put-streams-name` sends:

```json
{"stream":{"type":"wired","ingest":{"lifecycle":{},"processing":{"steps":[]},
  "settings":{},"failure_store":{},"wired":{"fields":{},"routing":[]}}}}
```

Kibana rejects it (`invalid_union`): `stream.ingest.lifecycle` must be one of
`{dsl}`/`{ilm}`/`{inherit}`/`{disabled}` and `failure_store` must be a concrete
object — empty `{}` matches none. The PUT fails `400`, the stream is never
created, and the subsequent operation returns `404 Cannot find stream cli-ft-…`.

### Classification: test definition

The seed request body is stale relative to the current Streams API schema.

### Fix

Regenerate/repair the Streams setup body against the current schema. Replace the
empty placeholders with valid union members, e.g.:

```json
{"stream":{"description":"","type":"wired",
  "ingest":{"lifecycle":{"inherit":{}},"processing":{"steps":[]},
    "settings":{},"failure_store":{"inherit":{}},
    "wired":{"fields":{},"routing":[]}}}}
```

Confirm exact required shapes from `@elastic/schemas` for the Streams ingest
lifecycle/failure_store unions, then update the generator input
(`codegen/functional/kb.ts` / the `streams_*` definitions) so all generated
`streams_*` scripts inherit the corrected body. Add one live check that the
setup PUT returns 2xx before asserting on the GET.

---

## Group 5 — `400 expected object, received null` (TEST, with CLI option)

Affected: `visualizations_upsert_visualization` (blocks all four
`visualizations_*` cases), `security_entity_store_post_security_entity_store_install`,
`…_uninstall`, `…_put_security_entity_store_start`, `…_stop`.

Signature:

```json
"message":"Invalid input: expected object, received null"
```

Cause: these commands require a request body, but the generated scripts invoke
them with no `--body`/`--data`, so the CLI serializes the body as `null` and
Kibana rejects it.

Example: `visualizations upsert-visualization --id cli-ft-visualization-get`
(no body) — an upsert with no document content.

### Classification: test definition (primary)

The setup calls omit a mandatory payload.

### Fixes

- **TEST (required)**: Provide a valid body for each body-bearing setup call, e.g.
  `upsert-visualization --id … --data '{"attributes":{…}}'` (use the shape from
  `@elastic/schemas`). For `entity_store` install/start/stop/uninstall, pass the
  minimal valid body (`--body '{}'` if the endpoint accepts an empty object;
  otherwise the required fields).
- **CLI (optional, decision-required)**: For POST/PUT endpoints whose body schema
  is an object with no required properties, consider defaulting an omitted body
  to `{}` instead of `null`, so `expected object, received null` cannot occur.
  Scope this carefully — only where the schema genuinely allows an empty object;
  do not blanket-send `{}` where fields are required (that would trade one 400 for
  another and hide the test gap). Recommendation: fix the tests first; treat the
  `{}` default as a separate, schema-gated enhancement with its own tests.

---

## Group 6 — Entity Store: `400 Entity Store is not installed` (ENV + TEST)

Affected: `security_entity_store_*` operations other than install
(`delete_…_entities`, `get_…_resolution_group`, `post/put_…_entities*`,
`…_resolution_link/unlink`, `put_…`).

Signature:

```json
"message":"Entity Store is not installed. Install it via POST /api/security/entity_store/install … then retry."
```

### Classification: environmental / ordering (primary) + test dependency (secondary)

Each script assumes the Entity Store engine is already installed, but nothing in
the per-script setup installs it (and the install test itself fails via Group 5).

### Fixes

- **ENV/TEST**: Install the Entity Store as a suite-level prerequisite before the
  dependent cases run, and uninstall in suite teardown:
  ```
  elastic stack kb security-entity-store post-security-entity-store-install --body '{}'
  ```
  (with a valid body per Group 5). Fixing Group 5's install body is a prerequisite
  for this group.
- Because install/enablement is async, add a readiness poll (`GET status`) before
  the dependent operations rather than calling them immediately.
- Requires a Security-enabled deployment (Group 1 ENV note).

---

## Group 7 — Workflows: `409` conflicts, `400` invalid workflow, `jq` shape errors (TEST + ENV)

Affected: `workflows_*` (several; `workflows_get_workflows_aggs` and
`_connectors` pass).

Three distinct sub-problems:

### 7a — `jq: error … Cannot index object with number (0)` (TEST)

`workflows_get_workflows.sh`, `…_workflow_workflowid_executions.sh`,
`…_put_workflows_managed_workflow_id.sh` assert `.[0].id` / `.[0].executionId`,
but the endpoints return an **object** (e.g. `{ "results": [...] }` /
`{ "workflows": [...] }`), not a top-level array.

Fix: correct the assertions to the real response shape, e.g.
`jq -e '.results[0].id'`. Verify each response envelope from the live API and
update the generator definitions accordingly.

### 7b — `409 Conflict` — already exists / running executions (TEST + ENV)

```
"Workflow with id 'cli-ft-…' already exists"
"Cannot force-delete workflows with running executions: [cli-ft-…]"
```

Leftover state from previous runs, plus teardown that cannot delete workflows
while executions are running.

Fixes:
- Make setup idempotent: delete-then-create, or use a unique per-run id suffix
  (e.g. `cli-ft-…-$RANDOM`/timestamp).
- In teardown, cancel/await running executions before force-delete, or poll until
  deletable; keep `|| true` but stop relying on it to hide conflicts.

### 7c — `400 Workflow is not valid` / `Workflow validation failed` (TEST)

```
"Workflow validation failed", "validationErrors":["name expects string (at step #1 › name)"]
```

The workflow YAML payloads sent by these cases do not satisfy the current
workflow schema (e.g. a step is missing a string `name`).

Fix: update the workflow YAML fixtures in the generator input to match the
current workflow schema (each step needs a valid `name`, etc.). Add a
create-time 2xx check before exercising execution sub-resources so an invalid
definition fails at the definition, not three calls later.

### 7d — `expected executionId to be truthy` (TEST)

`workflows_post_workflows_workflow_id_run.sh` asserts an `executionId` that the
run response does not surface (shape mismatch or the run did not start). Verify
the run response shape and correct the assertion path; depends on 7c (a valid
workflow) being fixed first.

---

## Suggested remediation order

1. **Group 3a (CLI)** — route `input_error` through the JSON error formatter;
   removes crash noise and enforces the `--json` error contract. Add regression test.
2. **Groups 4, 5, 7a/7c/7d (TEST)** — fix stale request bodies and response-shape
   assertions in the generator definitions; regenerate.
3. **Groups 2, 6, 7b (TEST)** — make setup/teardown idempotent and id-guarded.
4. **Groups 1, 2, 6 (ENV)** — run against deployments with the required solutions
   enabled, or add capability-probe SKIPs to the runner for absent features.
</content>
</invoke>
