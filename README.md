# :warning: `mvp` branch is a work in progress, proceed with caution

A CLI tool for interacting with Elasticsearch. Run `elastic --help` for basic usage.

## Build

With [`just`](https://just.systems/) installed:

```bash
just build
```

The resulting binary will be in `bin/elastic`.

## Unit tests

```bash
just test
```

## Linter

```bash
just lint
```

To format files:

```bash
just lint-fix
```
