---
description: Connect the Elastic CLI to Elastic Cloud and run example operations against the Cloud API.
applies_to:
  deployment:
    ech: preview
    ece: unavailable
  serverless: preview
type: how-to
---

# Connect to {{ecloud}} with the Elastic CLI

The Elastic CLI exposes {{ecloud}} APIs for managing organizations, {{ech}} deployments, and {{serverless-full}} projects. These APIs manage Cloud resources and their lifecycle; they are separate from the {{es}} and {{kib}} APIs used to work with data and solution features.

This guide assumes that you have already installed the CLI. Follow these steps to configure an {{ecloud}} connection, verify authentication, and run example operations against the {{ecloud}} API.

## Before you begin

You need:

- An [installed Elastic CLI](./installation.md).
- Access to an {{ecloud}} organization.
- An [{{ecloud}} API key](docs-content://deploy-manage/api-keys/elastic-cloud-api-keys.md) with Cloud API access and roles for the resources you want to manage.

## Add an {{ecloud}} context

The following steps create a context named `elastic-cloud` that connects to the public {{ecloud}} API.

If you use Bash or zsh, keep the API key out of your shell history by capturing it in a temporary variable:

```bash
read -rs ELASTIC_CLOUD_API_KEY
```

Paste your API key at the hidden prompt, press **Enter**, and create the context:

```bash
elastic config context add elastic-cloud \
  --cloud-url "https://api.elastic-cloud.com" \
  --cloud-api-key "$ELASTIC_CLOUD_API_KEY"
unset ELASTIC_CLOUD_API_KEY
```

The CLI stores the API key in your operating system's credential store when one is available. Otherwise, it stores the key in the configuration file and warns you. For other ways to provide and store secrets, refer to [external credentials](./configuration.md#external-credentials).

## Verify the connection

Check connectivity and authentication for the new context:

```bash
elastic --use-context elastic-cloud status
```

A successful check displays a check mark next to `https://api.elastic-cloud.com`.

To make `elastic-cloud` the active context, run:

```bash
elastic config current-context set elastic-cloud
```

The remaining examples use `--use-context` explicitly, so changing the active context is optional.

## Run {{ecloud}} API operations

The following commands are representative examples, not a complete list of supported operations. The resources and operations available to you depend on the permissions granted to the {{ecloud}} API key in the selected context.

:::{warning}
The creation examples are optional and can incur charges. Add `--dry-run` to a creation command to validate its input without creating a resource.
:::

### List Hosted deployments

List the {{ech}} deployments that your API key can access:

```bash
elastic --use-context elastic-cloud \
  cloud hosted deployments list-deployments
```

The response contains deployment identifiers, names, aliases, and resource details.

### List Serverless projects

List the {{serverless-full}} search projects that your API key can access:

```bash
elastic --use-context elastic-cloud \
  cloud serverless projects search list
```

Replace `search` with `observability` or `security` to list another project type:

```bash
elastic --use-context elastic-cloud \
  cloud serverless projects observability list
```

### Create a {{serverless-short}} project

List the available {{serverless-short}} regions:

```bash
elastic --use-context elastic-cloud \
  cloud serverless regions list-regions
```

Create a {{serverless-short}} project using one of the regions returned by the previous command. The following example creates an Observability project named `cli-example` in the AWS `us-east-1` region, identified as `aws-us-east-1` by {{serverless-short}}:

```bash
elastic --use-context elastic-cloud \
  cloud serverless projects observability create \
  --name "cli-example" \
  --region-id "aws-us-east-1" \
  --wait \
  --save-as "cli-example"
```

The CLI asks you to confirm the operation. The `--wait` option waits for the project to initialize, and `--save-as` stores its endpoint and credentials in a context named `cli-example`. Refer to [credential-safe project creation](./configuration.md#credential-safe-project-creation) for more details.

:::{note}
The {{ecloud}} API key used in this guide can also authenticate to the project's {{es}} API if it has **Cloud, {{es}}, and {{kib}} API** access and an appropriate role for the project. To use it instead of the default credentials, configure the project's {{es}} endpoint and the same API key in the `elasticsearch` block of a context.
:::

### Create an {{ech}} deployment

List the deployment templates available in your chosen region.

```bash
elastic --use-context elastic-cloud \
  cloud hosted deployment-templates get-deployment-templates-v2 \
  --region "<region-id>" <1>
```
1. Refer to [{{ech}} regions](cloud://reference/cloud/cloud-hosted/regions.md) for available region identifiers on ECH.

Create an {{ech}} deployment using one of the templates returned by the previous command. The following example creates a deployment named `cli-example` from the **General purpose** template in the AWS US East (N. Virginia) region (`us-east-1`):

```bash
elastic --use-context elastic-cloud \
  cloud hosted deployments create-deployment \
  --name "cli-example" \
  --region "us-east-1" \
  --template-id "aws-general-purpose"
```

The response contains the new deployment identifier and resource details. Refer to [Manage deployments using the {{ecloud}} API](docs-content://deploy-manage/deploy/elastic-cloud/manage-deployments-using-elastic-cloud-api.md#create-a-deployment-using-default-values) for more information about regions, templates, and custom deployment configurations.

## Next steps

- Run `elastic cloud --help`, `elastic cloud hosted --help`, or `elastic cloud serverless --help` to explore Cloud management commands.
- Use the [Elastic CLI command reference](./index.md) to inspect command options and input schemas.
- Use the [configuration guide](./configuration.md) to add {{es}} or {{kib}} to this context, or create a separate context for each environment.
