## Description

:::{warning}
Nightshift commands are experimental and subject to significant changes before they reach a stable state. Each run prints a warning to stderr; pass `--accept-experimental` to suppress it. The warning is not printed with `--json`.
:::

Ask the Nightshift assistant a question and get its answer back in a single response, without starting an investigation.
This is `elastic kb agent-builder post-chat-message` with the agent fixed to `nightshift.assistant`.

Nightshift is only available on {{serverless-short}} Observability projects, with the `agentBuilder:experimentalFeatures` advanced setting enabled.
The command is hidden when the context's `kibana.version` [hint](../configuration.md#versions) is a {{stack}} version, and the `stack` command profile blocks it.

```bash
elastic nightshift ask "Why did checkout latency spike at 14:00?"
elastic nightshift ask --conversation-id <id> "Which service should I look at first?"
```
