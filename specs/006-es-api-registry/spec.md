# Feature spec: Elasticsearch API Registry

**Feature Branch**: `006-es-api-registry`
**Created**: 2026-04-02
**Status**: Draft
**Input**: User description: "Define a scalable structure for registering Elasticsearch API commands under `elastic es`, avoiding per-API `defineCommand`/`defineGroup` boilerplate. Decide between a single trie-like registry object and per-API module files imported dynamically. Include 3-4 working API implementations as proof of concept."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover available Elasticsearch API commands (Priority: P1)

A user (human or LLM agent) runs `elastic es --help` and sees a list of all supported Elasticsearch API operations organized as subcommands. Each subcommand shows a brief description so the user can find the API they need without consulting external documentation.

**Why this priority**: Discoverability is the core value proposition—if users cannot find commands, nothing else matters.

**Independent Test**: Run `elastic es --help` and confirm that all registered API operations appear with descriptions in the output.

**Acceptance Scenarios**:

1. **given** the CLI is installed and configured, **when** a user runs `elastic es --help`, **then** all registered Elasticsearch API commands appear as subcommands with descriptions.
2. **given** the CLI is installed, **when** a user runs `elastic es <api-name> --help`, **then** help text for that specific API is displayed, including its accepted options and input schema.

---

### User Story 2 - Execute an Elasticsearch API request via the CLI (Priority: P1)

A user runs an Elasticsearch API command (e.g., `elastic es cat-health`) and receives the API response rendered in the configured output format (text or JSON). The CLI constructs the correct HTTP request (method, path, query parameters, body) from the command's metadata and the user-provided options/input.

**Why this priority**: Executing API requests is the primary functional purpose of the `es` subcommand group.

**Independent Test**: Configure a valid Elasticsearch connection, run `elastic es cat-health`, and verify the response matches what the cluster returns.

**Acceptance Scenarios**:

1. **given** a valid Elasticsearch connection is configured, **when** a user runs `elastic es cat-health`, **then** the CLI sends `GET /_cat/health` and displays the response.
2. **given** a valid connection and an API that accepts a request body, **when** a user provides input via `--file` or stdin, **then** the CLI sends the body with the correct HTTP method and path and displays the response.
3. **given** an API that accepts path parameters (e.g., index name), **when** the user supplies those as CLI arguments or options, **then** the CLI interpolates them into the request path.

---

### User Story 3 - Add a new Elasticsearch API command with minimal boilerplate (Priority: P2)

A developer (or code-generation tool) adds support for a new Elasticsearch API by creating a single, self-contained definition that specifies the API's HTTP method, path template, query parameters, and input schema. No changes to a central router or command tree are needed.

**Why this priority**: Low-friction extensibility is essential because hundreds of APIs must be registered, and code generation will handle most of them.

**Independent Test**: Add a new API definition following the established pattern, then verify `elastic es --help` includes the new command and it executes correctly.

**Acceptance Scenarios**:

1. **given** a developer creates a new API definition following the standard structure, **when** the CLI loads, **then** the new command appears under `elastic es` without modifying any other file.
2. **given** the definition structure is documented, **when** a code-generation tool produces definitions from an API spec, **then** each generated definition is immediately usable.

---

### User Story 4 - Validate input before sending a request (Priority: P3)

When a user provides invalid input (wrong types, missing required fields, unknown parameters), the CLI rejects the request with a clear, actionable error message before making any network call.

**Why this priority**: Input validation prevents confusing server-side errors and is important for agent consumers that rely on structured error output.

**Independent Test**: Provide malformed input to an API command and verify the CLI exits with a validation error rather than sending the request.

**Acceptance Scenarios**:

1. **given** an API command with a defined input schema, **when** a user supplies input that violates the schema, **then** the CLI outputs a validation error listing the specific issues and does not send a request.

---

### Edge Cases

- What happens when the user runs a command for an API that requires a request body but provides none?
- How does the system handle APIs with optional path segments (e.g., `/_cat/indices` vs `/_cat/indices/{index}`)?
- What happens if two API definitions conflict on the same command name?
- How does the system behave when the Elasticsearch cluster returns a non-2xx response?
- What happens when a user passes `--format json` to an API that returns plain text (e.g., `_cat` APIs)? → The raw response is passed through as-is; the CLI does not convert between formats.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an `es` command group under the root `elastic` command. API namespaces (e.g., cat, indices, cluster) MUST be registered as nested subcommand groups under `es`, with individual API operations as leaf commands (e.g., `elastic es cat health`).
- **FR-002**: The system MUST support a standardized API definition structure that captures: command name, description, HTTP method, URL path template, accepted query parameters, path parameters, and an optional request body schema.
- **FR-003**: The system MUST automatically register all API definitions as subcommands of `elastic es` so that they appear in `--help` output and are executable.
- **FR-004**: The system MUST construct the correct HTTP request (method, path with interpolated parameters, query string, body) from the API definition and user-provided input.
- **FR-005**: The system MUST validate user-provided input against the API definition's schema before sending any request.
- **FR-006**: The system MUST support both CLI options/arguments and structured input (via `--file` or stdin) for providing request data, consistent with the existing `defineCommand` input mechanism.
- **FR-007**: The system MUST include full implementations of all `_cat` namespace APIs and all `indices` namespace APIs as proof-of-concept, covering two distinct namespaces to validate the registry architecture across different API shapes (text responses, JSON responses, path parameters, request bodies).
- **FR-008**: The system MUST use `@elastic/transport` to execute Elasticsearch requests, leveraging its built-in connection pooling, retry logic, sniffing, and authentication support.
- **FR-009**: The system MUST support path parameters in URL templates (e.g., `/{index}/_search`) and map them from CLI arguments or options.
- **FR-010**: The system MUST allow new API definitions to be added without modifying existing files beyond the API definitions directory/registry.

### Key Entities

- **API Definition**: A declarative structure describing a single Elasticsearch API endpoint—its command name, namespace, description, HTTP method, path template, path parameters, query parameters, and optional request body schema. The structure must be extensible to support future fields such as aliases.
- **API Registry**: A collection of per-namespace static registry files (one per ES namespace such as cat, indices, cluster), each exporting an array of API definitions. A single barrel module re-exports all namespaces into a flat array consumed by the `es` command group at startup.
- **Request Builder**: The component that transforms an API definition plus parsed user input into a concrete HTTP request (method, URL, headers, body).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `elastic es --help` lists namespace groups; `elastic es <namespace> --help` lists that namespace's API commands with descriptions.
- **SC-002**: Each proof-of-concept API command successfully executes its corresponding Elasticsearch request and returns the response.
- **SC-003**: A new API command can be added by adding a definition to the appropriate namespace registry file with no changes to other source files (unless introducing a new namespace, which requires one import line in the barrel).
- **SC-004**: Invalid input is rejected with a clear error message before any network request is made.
- **SC-005**: The `--help` output for each API subcommand accurately describes accepted options, arguments, and input schema.

## Assumptions

- `@elastic/transport` will be added as a project dependency to serve as the HTTP transport layer, providing connection pooling, retry logic, sniffing, and authentication support out of the box.
- Commander.js supports the dynamic addition of subcommands at program initialization time, which is required for the registry approach.
- The proof-of-concept covers all APIs in two namespaces (`cat` and `indices`), chosen to exercise a broad range of API shapes: text-based responses (`_cat`), JSON responses (`indices`), optional path parameters, and request bodies. Specific API counts are determined by the official Elasticsearch API surface for these namespaces.
- Non-2xx Elasticsearch responses will be surfaced as structured errors consistent with the CLI's existing error-output conventions.
- The registry uses per-namespace static registry files (one file per ES namespace) with a barrel module that re-exports all definitions. This was chosen over a single giant file (merge-conflict risk, unwieldy at scale) and per-API dynamic modules (startup latency, type-safety gaps, runtime complexity).


## Clarifications

### Session 2026-04-02

- Q: What registry architecture should be used — single trie, per-API dynamic modules, or per-namespace static files? → A: Per-namespace static registry files (Approach C). One file per ES namespace with a static barrel import. Balances startup performance, type safety, git-friendliness, and code-generation compatibility.
- Q: Should commands be flat (`elastic es cat-health`) or nested by namespace (`elastic es cat health`)? → A: Nested by namespace (default). The API definition structure must be designed to accommodate a future command-aliasing feature (separate spec) that could add flat shorthand paths without architectural changes.