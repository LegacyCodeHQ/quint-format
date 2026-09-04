# quint-format

An independent, opinionated formatter for the
[Quint specification language](https://quint-lang.org/), powered by
[tree-sitter-quint](https://github.com/LegacyCodeHQ/tree-sitter-quint).

`quintfmt` is not an official Quint project. Semantic checks such as types and
modes remain the responsibility of the Quint compiler.

## Install

```sh
npm install --global @legacycodehq/quint-format
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

Apache-2.0
