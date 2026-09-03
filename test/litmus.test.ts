import { describe, expect, test } from "bun:test";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { formatQuint } from "../src/index";

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
    expect(formatQuint("module Example {}")).toMatchSnapshot();
  });
});
