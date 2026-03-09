# objective

Create a Kibana dashboard titled `{{unique_id}}` with the local `elastic` CLI against the running functional stack.

# success_criteria

- A dashboard titled `{{unique_id}}` exists and has a non-empty id.

# verify

```verify
run: elastic kb dashboard list "{{unique_id}}" -f json
jmespath: dashboards[?data.title=='{{unique_id}}'] | [0].id
assert: not_empty
```
