import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkQuint, formatQuint } from "../../../src/index.js";
import { parseQuint } from "../../../src/parsing/parser.js";
import { compareSource, mapNodes } from "../src/comparison.js";
import type { Formatter } from "../src/formatter.js";
import { PathFormatter } from "../src/formatter.js";
import { Repository } from "../src/repository.js";
import { markdownComparison, selectionPair, selectionRanges } from "../src/selection.js";
import { startServer } from "../src/server.js";

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

const input = 'module Demo{val x=1+2 val greeting="héllo 🌍"}\n';
const expected = 'module Demo {\n  val x = 1 + 2\n  val greeting = "héllo 🌍"\n}\n';
const compare = (source: string) => compareSource(source, formatQuint(source));

test("comparison preserves exact source, validates both trees, and yields idempotent output", () => {
  const result = compare(input);
  expect(result.error).toBeUndefined();
  expect(result.mappingWarning).toBeUndefined();
  expect(result.before).toBe(input);
  expect(result.after).toBe(expected);
  expect(result.changed).toBe(true);
  expect(parseQuint(input).hasError).toBe(false);
  expect(parseQuint(expected).hasError).toBe(false);
  expect(formatQuint(expected)).toBe(expected);
  expect(checkQuint(expected, "demo.qnt")).toEqual([]);
  expect(compare(expected).changed).toBe(false);
  for (const node of result.nodes.filter((node) => node.token)) {
    expect(result.before.slice(node.before.start, node.before.end)).toBe(
      expected.slice(node.after.start, node.after.end),
    );
  }
});

test("clicking and multi-node selection map repeated identifiers and Unicode offsets", () => {
  const result = compare(input);
  const start = input.indexOf('"héllo');
  const clicked = selectionPair(result.nodes, start + 4, start + 4);
  expect(clicked?.type).toBe("string_literal");
  expect(expected.slice(clicked?.after.start, clicked?.after.end)).toBe('"héllo 🌍"');
  const selected = selectionRanges(result.nodes, input.indexOf("val"), input.indexOf("}"));
  expect(expected.slice(selected?.after.start, selected?.after.end)).toBe(
    'val x = 1 + 2\n  val greeting = "héllo 🌍"',
  );
  const reverse = selectionRanges(
    result.nodes,
    clicked?.after.start ?? 0,
    clicked?.after.end ?? 0,
    "after",
  );
  expect(input.slice(reverse?.before.start, reverse?.before.end)).toBe('"héllo 🌍"');
  const repeated = compare("module M { val x=1 val y=x+x }\n");
  const secondX = repeated.before.lastIndexOf("x");
  expect(selectionPair(repeated.nodes, secondX, secondX)?.after.start).toBe(
    repeated.after?.lastIndexOf("x"),
  );
});

test("selection at whitespace boundaries does not expand to the whole module", () => {
  const result = compare(expected);
  const selected = selectionRanges(
    result.nodes,
    expected.indexOf("  val"),
    expected.indexOf("  val greeting"),
  );
  expect(expected.slice(selected?.before.start, selected?.before.end)).toBe("val x = 1 + 2");
});

test("removed semicolons retain declaration and comment correspondence", () => {
  const result = compare("module M {\n// keep me\nval x=1;\nval y=x;\n}\n");
  expect(result.error).toBeUndefined();
  expect(result.mappingWarning).toBeUndefined();
  expect(result.after).toContain("// keep me");
  expect(result.after).not.toContain(";");
  expect(result.nodes.some((node) => node.type.includes("comment"))).toBe(true);
});

test("comment reindentation and trailing spaces preserve linked selections", () => {
  const result = compare("module M {\n    /* first\n       second */\n    val x=1 // tail  \n}\n");
  expect(result.error).toBeUndefined();
  expect(result.mappingWarning).toBeUndefined();
  const comment = result.nodes.find((node) => node.type === "comment");
  expect(comment).toBeDefined();
  expect(result.after?.slice(comment?.after.start, comment?.after.end)).toContain("second */");
});

test("invalid syntax preserves input with an explicit error; changed tokens never receive guessed mappings", () => {
  const invalid = "module Broken { val x = }";
  const result = compareSource(invalid, "");
  expect(result.before).toBe(invalid);
  expect(result.after).toBeNull();
  expect(result.error).toBeDefined();
  expect(result.nodes).toEqual([]);
  expect(() =>
    mapNodes(parseQuint("module M { val x=1 }"), parseQuint("module M { val x=2 }")),
  ).toThrow("correspondence changed");
});

test("Markdown export labels both versions and safely fences embedded backticks", () => {
  expect(markdownComparison("val x=1", "val x = 1")).toBe(
    "### Before\n\n```quint\nval x=1\n```\n\n### After\n\n```quint\nval x = 1\n```\n",
  );
  expect(markdownComparison("// ```", "// ```")).toContain("````quint\n// ```\n````");
});

test("PATH formatter resolves the executable and picks up binary replacements without rebuilding", async () => {
  const path = await mkdtemp(join(tmpdir(), "quint-review-formatter-"));
  temporary.push(path);
  const executable = join(path, "review-test-quintfmt");
  const previousPath = process.env.PATH;
  process.env.PATH = `${path}:${previousPath ?? ""}`;
  try {
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(expected)});\n`,
    );
    await chmod(executable, 0o755);
    const formatter = PathFormatter.discover("review-test-quintfmt");
    expect(formatter.displayPath).toBe(executable);
    expect(await formatter.format("unused.qnt")).toBe(expected);

    const replacement = expected.replace("1 + 2", "1+2");
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(replacement)});\n`,
    );
    await chmod(executable, 0o755);
    expect(await formatter.format("unused.qnt")).toBe(replacement);
  } finally {
    process.env.PATH = previousPath;
  }
  expect(() => PathFormatter.discover("definitely-not-a-real-quintfmt-command")).toThrow(
    "Cannot find",
  );
});

async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "quint-review-test-"));
  temporary.push(path);
  execFileSync("git", ["init", "-q", path]);
  await mkdir(join(path, "nested"));
  await writeFile(join(path, ".gitignore"), "ignored.qnt\n");
  await writeFile(join(path, "tracked.qnt"), input);
  await writeFile(join(path, "deleted.qnt"), input);
  execFileSync("git", ["-C", path, "add", "tracked.qnt", "deleted.qnt"]);
  await rm(join(path, "deleted.qnt"));
  await writeFile(join(path, "nested", "space ü.qnt"), input);
  await writeFile(join(path, "ignored.qnt"), input);
  await writeFile(join(path, "wrong.quint"), input);
  await symlink(join(path, "tracked.qnt"), join(path, "link.qnt"));
  return path;
}

test("Git discovery includes tracked and untracked .qnt files, excludes ignored/deleted/symlink files, and scopes subdirectories", async () => {
  const path = await fixture();
  const repository = await Repository.open(path);
  expect(await repository.refresh()).toEqual(["nested/space ü.qnt", "tracked.qnt"]);
  expect((await repository.read("nested/space ü.qnt")).source).toBe(input);
  await expect(repository.read("../outside.qnt")).rejects.toThrow("Unknown");
  await expect(repository.read("ignored.qnt")).rejects.toThrow("Unknown");
  expect(await (await Repository.open(join(path, "nested"))).refresh()).toEqual(["space ü.qnt"]);
  await writeFile(join(path, "new.qnt"), input);
  expect(await repository.refresh()).toContain("new.qnt");
});

test("server serves embedded assets and read-only comparisons, rejects cross-origin requests and unknown paths", async () => {
  const path = await fixture();
  const repository = await Repository.open(path);
  const formatter: Formatter = {
    displayPath: "/test/bin/quintfmt",
    async format(filePath) {
      return formatQuint(await readFile(filePath, "utf8"));
    },
  };
  const { server, url } = startServer(
    repository,
    formatter,
    {
      html: "<html>review</html>",
      css: "body{}",
      js: "console.log('review')",
    },
    0,
  );
  const beforeStatus = execFileSync("git", ["-C", path, "status", "--porcelain=v1", "-z"]);
  try {
    expect(new URL(url).pathname).toBe("/");
    expect(await (await fetch(url)).text()).toBe("<html>review</html>");
    expect(await (await fetch(`${url}api/files`)).json()).toMatchObject({
      formatter: "/test/bin/quintfmt",
    });
    expect((await fetch(`${url}style.css`)).headers.get("content-type")).toBe(
      "text/css; charset=utf-8",
    );
    const result = await (
      await fetch(`${url}api/compare?path=${encodeURIComponent("nested/space ü.qnt")}`)
    ).json();
    expect(result.after).toBe(expected);
    expect((await fetch(`${url}api/compare?path=..%2Foutside.qnt`)).status).toBe(400);
    expect((await fetch(url, { method: "POST" })).status).toBe(405);
    expect((await fetch(url, { headers: { Origin: "https://example.com" } })).status).toBe(403);
    expect((await fetch(new URL("/unknown", url))).status).toBe(404);
    expect(await readFile(join(path, "tracked.qnt"), "utf8")).toBe(input);
    expect(execFileSync("git", ["-C", path, "status", "--porcelain=v1", "-z"])).toEqual(
      beforeStatus,
    );
  } finally {
    server.stop(true);
  }
});
