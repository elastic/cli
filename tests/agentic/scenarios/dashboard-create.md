# objective

Use Copilot CLI to create a Kibana dashboard titled `{{dashboard_title}}` with the local `elastic` CLI against the running functional stack.

# success_criteria

- `elastic kb dashboard list "{{dashboard_title}}" -f json` returns at least one dashboard and one result has a non-empty `id`.
- `elastic kb dashboard get "{{dashboard_id}}" -f json` returns a dashboard whose title is exactly `{{dashboard_title}}`.
