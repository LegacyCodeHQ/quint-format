# Quint Format Review

A local, read-only browser tool for reviewing the formatter against any Git working
directory. Built separately from the published formatter, using this checkout's
formatter implementation. Requires Bun and Git; no frontend dependencies or CDN.

## Build

From the quint-format repository root:

```sh
bun install
bun run --cwd tools/quint-format-review build
```

The build embeds the browser assets and formatter into `dist/cli.js` inside this
directory. It uses the native Tree-sitter dependencies installed at the repository
root. Keep the build in this checkout; it is not a standalone binary. Rebuild after
changing the formatter or viewer.

## Run from any Git repository

```sh
cd /path/to/repository-to-review
bun /absolute/path/to/quint-format/tools/quint-format-review/dist/cli.js
```

Or supply the directory explicitly:

```sh
bun tools/quint-format-review/dist/cli.js /path/to/repository-to-review
```

The CLI opens your browser automatically and prints a local URL. Stop it with
Ctrl+C. Use `--no-open` to open the URL yourself, `--port 4310` to select a port,
or `--help` for usage. Port `0`, the default, chooses an available port.

For a short command, add a shell alias using your actual checkout path:

```sh
alias quint-review='bun /absolute/path/to/quint-format/tools/quint-format-review/dist/cli.js'
```

## Review

- The file tree includes tracked and untracked `.qnt` files beneath the directory
  you launch from. Untracked Git-ignored files, deleted files, and symlinks are
  excluded. Tracked files remain visible even if an ignore rule matches them.
  Submodules are separate repositories; launch inside one to review it.
- Filter by filename or path, expand folders, and click a file to compare its
  current disk contents with the formatter output. Refresh rescans the tree and
  reloads the selected file. Files are loaded on demand, never written.
- Click a token to highlight its corresponding syntax node on both sides. Drag
  across code to highlight matching nodes; partial tokens expand to their full
  token boundaries. Selection works in either panel. Scrolling is synchronized
  using token locations and can be switched off.
- **Copy before & after** copies labeled Markdown code blocks. With a selection,
  it copies the highlighted ranges; otherwise it copies both complete files.
  **Clear selection** or Escape returns to whole-file copying.
- Parser or formatter errors appear above the original source. If token
  correspondence cannot be established, a warning explains why linked selection
  is unavailable; the formatted preview and whole-file copy still work.

The server binds only to `127.0.0.1`, uses an unpredictable session URL, rejects
foreign origins and non-GET requests, and serves all assets locally. Files larger
than 2 MiB show an explicit error. This is a local developer tool, not a hosted
service. Clipboard copying requires browser clipboard permission.

## Development checks

```sh
bun run --cwd tools/quint-format-review test
bun run --cwd tools/quint-format-review check
bun run --cwd tools/quint-format-review build
bun test
bun run check
git diff --check
```

Tests cover concrete syntax mapping, Unicode offsets, multi-node selection,
Markdown fences, invalid input, Git discovery, directory confinement, and the
HTTP server's read-only behavior. The server integration test needs permission
to listen on localhost.
