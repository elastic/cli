# cloud

Elastic Cloud API commands.

## Serverless projects

Manage Elastic Cloud Serverless projects:

```bash
elastic cloud serverless projects list
elastic cloud serverless projects get <id>
elastic cloud serverless projects create --data '{"name":"my-project","region_id":"aws-us-east-1"}'
elastic cloud serverless projects update <id> --data '{"name":"new-name"}'
elastic cloud serverless projects delete <id>
```

By default, commands use `https://api.elastic-cloud.com`. Override this with `--cloud-url`:

```bash
elastic cloud serverless projects list --cloud-url 'https://api.elastic-cloud.com'
```

Use `--type` to select project type (`elasticsearch`, `observability`, `security`, `workplaceai`).
