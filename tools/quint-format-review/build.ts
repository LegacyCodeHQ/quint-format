import { chmod } from "node:fs/promises";
import { join } from "node:path";

const root = import.meta.dir;
const browser = await Bun.build({
  entrypoints: [join(root, "src/web/app.ts")],
  target: "browser",
  minify: true,
});
if (!browser.success) throw new AggregateError(browser.logs, "Browser build failed");
const result = await Bun.build({
  entrypoints: [join(root, "src/cli.ts")],
  target: "bun",
  outdir: join(root, "dist"),
  external: ["tree-sitter", "@legacycodehq/tree-sitter-quint"],
  define: {
    REVIEW_HTML: JSON.stringify(await Bun.file(join(root, "src/web/index.html")).text()),
    REVIEW_CSS: JSON.stringify(await Bun.file(join(root, "src/web/style.css")).text()),
    REVIEW_JS: JSON.stringify(await browser.outputs[0].text()),
  },
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");
await chmod(join(root, "dist/cli.js"), 0o755);
console.log("Built tools/quint-format-review/dist/cli.js");
