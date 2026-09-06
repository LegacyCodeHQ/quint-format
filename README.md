# quint-format

[![Built with Clarity](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FLegacyCodeHQ%2Fclarity-cli%2Frefs%2Fheads%2Fmain%2Fbadges%2Fshields.io.json)](https://github.com/LegacyCodeHQ/clarity-cli)
[![License](https://img.shields.io/github/license/LegacyCodeHQ/quint-format)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@legacycodehq/quint-format/next?label=npm)](https://www.npmjs.com/package/@legacycodehq/quint-format)

An opinionated formatter for the
[Quint specification language](https://quint-lang.org/), powered by
[tree-sitter-quint](https://github.com/LegacyCodeHQ/tree-sitter-quint).

> This release is an early public preview targeting Quint 0.32.x.

## Install

Requires Node.js 22 or newer.

```sh
npm install --global @legacycodehq/quint-format@next
```

## Use

Print a formatted file:

```sh
quintfmt spec.qnt
```

Check files or directories without changing them:

```sh
quintfmt --check .
```

Format files or directories in place:

```sh
quintfmt --write .
```

For local setup and project maintenance, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Visual formatter review

The separate internal [Quint Format Review](tools/quint-format-review/README.md)
tool opens a local browser with a `.qnt` file tree, original and formatted source
panels, linked syntax selections, and before/after Markdown copying. It can run
against any Git working directory without changing its files.

```sh
bun run --cwd tools/quint-format-review build
bun tools/quint-format-review/dist/cli.js /path/to/repository
```

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

Copyright (c) 2026-present, Legacy Code Headquarters (OPC) Private Limited. All
rights reserved.
