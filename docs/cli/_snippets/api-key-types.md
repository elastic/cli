:::{note}
Elastic provides different API key types for different APIs. The Elastic CLI supports:

- [{{es}} API keys](docs-content://deploy-manage/api-keys/elasticsearch-api-keys.md) for accessing {{es}} and {{kib}} APIs in self-managed or {{eck}} clusters and {{ece}} or {{ech}} deployments.
- [Serverless project API keys](docs-content://deploy-manage/api-keys/serverless-project-api-keys.md) for accessing {{es}} and {{kib}} APIs within a specific {{serverless-full}} project.
- [{{ecloud}} API keys](docs-content://deploy-manage/api-keys/elastic-cloud-api-keys.md) for managing organizations, {{ech}} deployments, and {{serverless-full}} projects. In {{serverless-short}}, a Cloud API key with **Cloud, {{es}}, and {{kib}} API** access and an appropriate role for each relevant project can also call project-level {{es}} and {{kib}} APIs. {{ecloud}} API keys can't authenticate against {{es}} or {{kib}} endpoints on {{ech}}.

Refer to [Elastic API keys](docs-content://deploy-manage/api-keys.md) to compare all available key types.
:::
