# quint-format

An independent, opinionated formatter for the
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

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

Copyright (c) 2026-present, Legacy Code Headquarters (OPC) Private Limited. All
rights reserved.
