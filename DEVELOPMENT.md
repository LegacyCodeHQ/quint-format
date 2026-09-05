# Development

## Requirements

- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/) 22 or newer
- The `quint` executable, for validation against Quint's reference parser

## Setup

```sh
git clone git@github.com:LegacyCodeHQ/quint-format.git
cd quint-format
bun install
bun run build
bun test
```

## Commands

```sh
bun run check
bun run build
bun run format
bun test
bun run test:coverage
bun run test:official -- /path/to/quint/examples
```

The official-corpus check verifies parse-tree preservation, idempotence,
formatter diagnostics, and acceptance by the Quint parser.

The coverage command prints a source-only report, writes
`coverage/lcov.info`, and enforces the thresholds in `bunfig.toml`.

Formatter changes follow the check, reference-parser, fix, reference-parser
workflow documented in [AGENTS.md](AGENTS.md).
