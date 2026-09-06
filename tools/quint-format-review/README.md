# Quint Format Review

A local, read-only browser tool for reviewing the `quintfmt` executable found in
`PATH` against any Git working directory. Built separately from the published
formatter. Requires Bun, Git, and `quintfmt`; no frontend dependencies or CDN.

## Build

From the quint-format repository root:

```sh
bun install
bun run --cwd tools/quint-format-review build
```

The build embeds the browser assets and syntax-mapping parser into `dist/cli.js`
inside this directory. It uses the native Tree-sitter dependencies installed at
the repository root. Keep the build in this checkout; it is not a standalone
binary. Rebuild after changing the viewer, but not after changing `quintfmt`.

## Run from any Git repository

```sh
cd /path/to/repository-to-review
bun /absolute/path/to/quint-format/tools/quint-format-review/dist/cli.js
```

Or supply the directory explicitly:

```sh
bun tools/quint-format-review/dist/cli.js /path/to/repository-to-review
```

The CLI opens your browser automatically at `http://127.0.0.1:4310/`. Stop it
with Ctrl+C. Use `--no-open` to open the URL yourself, `--port <number>` to
select another port, or `--help` for usage. Port `0` chooses an available port.

At startup, the CLI resolves `quintfmt` from its inherited `PATH`, prints the
resolved location, and shows it in the browser sidebar. Every file load invokes
`quintfmt <absolute-file-path>` as a read-only subprocess. Replacing the executable
at that path takes effect on the next file load or refresh without rebuilding or
restarting this tool. Restart the tool if you change which directory `PATH` resolves
first, because a running process retains its inherited environment.

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
- Changed line blocks stay highlighted in amber before formatting and green
  after formatting; unchanged lines keep their normal background. The arrows
  beside the changed-block count jump both panels to the previous or next edit.
  Whitespace and final-newline changes are included. A boundary marker identifies
  the corresponding position when a block only inserts or removes lines. Linked
  selections use blue so they remain distinct from the change highlights.
  Within changed lines, darker amber and green marks show the exact spaces or
  tabs removed and added. Newline-only changes remain represented by the line
  highlight or boundary marker.
- **Copy before & after** copies labeled Markdown code blocks. With a selection,
  it copies the highlighted ranges; otherwise it copies both complete files.
  **Clear selection** or Escape returns to whole-file copying.
- Parser or formatter errors appear above the original source. If token
  correspondence cannot be established, a warning explains why linked selection
  is unavailable; the formatted preview and whole-file copy still work.

The server binds only to `127.0.0.1`, rejects foreign origins and non-GET
requests, and serves all assets locally. Files larger than 2 MiB show an explicit
error. This is a local developer tool, not a hosted service. Clipboard copying
requires browser clipboard permission.

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
