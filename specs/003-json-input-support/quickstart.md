# Quickstart: JSON Input Support

## Defining a Command with JSON Input

Add `input: true` to your `CommandConfig`:

```typescript
const myCmd = defineCommand({
  name: 'create-index',
  description: 'Create an Elasticsearch index',
  input: true,
  handler(parsed) {
    if (parsed.input != null) {
      // parsed.input is the JSON object from --file or stdin
      console.log('Received input:', parsed.input)
    } else {
      console.log('No input provided')
    }
  },
})
```

## Providing JSON Input

### Via `--file`

```bash
elastic create-index --file index-settings.json
```

### Via stdin

```bash
cat index-settings.json | elastic create-index
echo '{"mappings":{"properties":{"title":{"type":"text"}}}}' | elastic create-index
```

## Error Cases

```bash
# File not found
elastic create-index --file nonexistent.json
# Error: --file: file not found: nonexistent.json

# Invalid JSON
echo '{bad json' | elastic create-index
# Error: stdin: invalid JSON: Expected property name or '}' ...

# Both --file and stdin
cat data.json | elastic create-index --file other.json
# Error: cannot read input from both --file and stdin; provide one or the other

# Empty file
elastic create-index --file empty.json
# Error: --file: invalid JSON: empty content
```
