# Development

## Requirements

- [Bun](https://bun.sh/)
- The `quint` executable, for validation against Quint's reference parser

## Setup

```sh
git clone git@github.com:LegacyCodeHQ/quint-format.git
cd quint-format
bun install
bun test
```

## Commands

```sh
bun run check
bun run format
bun test
bun run test:official -- /path/to/quint/examples
```

The official-corpus check verifies parse-tree preservation, idempotence,
formatter diagnostics, and acceptance by the Quint parser.

Formatter changes follow the check, reference-parser, fix, reference-parser
workflow documented in [AGENTS.md](AGENTS.md).
