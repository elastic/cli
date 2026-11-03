## Description

Ask the Nightshift investigation agent a question and get its answer back in a single response.
This is `elastic kb agent-builder post-chat-message` with the agent fixed to `nightshift.investigation`.
Intended for Serverless Observability projects: requires {{kib}} 9.6+ with the `agentBuilder:experimentalFeatures` advanced setting enabled, and the `stack` command profile hides and blocks it.

```bash
elastic nightshift ask "Why did checkout latency spike at 14:00?"
elastic nightshift ask --conversation-id <id> "Which service should I look at first?"
```
