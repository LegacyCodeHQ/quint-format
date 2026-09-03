import { describe, expect, test } from "bun:test";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "../src/index";

describe("test harness", () => {
  test("runs regular assertions", () => {
    expect(1 + 1).toBe(2);
  });

  test("records snapshot approvals", () => {
    const formatted = ["module Example {", "  val answer = 42", "}"].join("\n");

    expect(formatted).toMatchSnapshot();
  });

  test("parses Quint source", () => {
    const parser = new Parser();
    parser.setLanguage(Quint);

    const root = parser.parse("module Example {}").rootNode;

    expect(root.type).toBe("source_file");
    expect(root.hasError).toBe(false);
  });
});

describe("formatter", () => {
  test("formats an empty module", () => {
    const input = "module Example {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("checks a compact empty module", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/compact-empty-module.qnt"],
      { cwd: import.meta.dir.replace(/\/test$/, "") },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });
});
