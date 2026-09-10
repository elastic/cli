---
description: Install the Elastic CLI globally with npm to run elastic commands from your terminal.
applies_to:
  stack: preview
  serverless: preview
type: how-to
---

# Install the Elastic CLI

## Before you begin

You need Node.js 22 or later and npm (included with Node.js) installed on your system. The CLI is tested on Linux, macOS, and Windows.

## Install globally

1. Install the `elastic` binary to your `PATH`:

   ```bash
   npm install -g @elastic/cli
   ```

2. Verify the installation:

   ```bash
   elastic --version
   ```

## Run without installing

To run a one-off command without a permanent install, use `npx`:

```bash
npx -y @elastic/cli --help
```

## Next steps

- [Configure the Elastic CLI](./configuration.md) to connect to your Elasticsearch, Kibana, or Elastic Cloud endpoints.
