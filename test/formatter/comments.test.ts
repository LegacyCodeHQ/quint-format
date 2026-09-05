import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "../../src/index";

describe("comments", () => {
  test("preserves a leading line comment", () => {
    const input = "module Example {\n// The answer\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a definition documentation comment", () => {
    const input = "module Example {\n/// The answer\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes trailing whitespace from comments", () => {
    const input = [
      "module Example {",
      "  // First explanation.   ",
      "  pure val first = 1",
      "",
      "  /**",
      "   * Second explanation.  ",
      "   */",
      "  pure val second = 2",
      "}",
      "",
    ].join("\n");
    const output = formatQuint(input);
    const diagnostics = checkQuint(input, "input.qnt").filter(
      (diagnostic) => diagnostic.rule === "format/comment-trailing-whitespace",
    );

    expect(output).not.toMatch(/[ \t]+$/m);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ line: 2, column: 24, length: 3 });
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves blank lines between leading comment groups", () => {
    const input = readFileSync(
      new URL("../fixtures/leading-comment-gaps.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "  // val first = source\n\n  // Second disabled example\n  // val second = source\n\n  def update",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a leading single-line block comment", () => {
    const input = "module Example {\n/* The answer */\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("indents a leading multiline block comment", () => {
    const input = "module Example {\n/*\n * The answer\n */\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a module documentation comment", () => {
    const input = " /// Module documentation\nmodule Example {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves blank lines between top-level comment groups", () => {
    const input = readFileSync(
      new URL("../fixtures/top-level-comment-gaps.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(" * First notice.\n */\n\n/**\n * Second notice.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing line comment", () => {
    const input = "module Example {\n  val answer = 42// The answer\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments on module definitions", () => {
    const input = readFileSync(
      new URL("../fixtures/aligned-module-definition-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned declarations with a continuation comment", () => {
    const input = readFileSync(
      new URL("../fixtures/aligned-declaration-continuation-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("shifts a continuation comment with its declaration", () => {
    const input = readFileSync(
      new URL("../fixtures/shifted-continuation-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = [
      "module ShiftedContinuation {",
      "  const Quorum: Set[Set[str]] // The set of quorums, where a quorum is a",
      "                              // large enough set of acceptors.",
      "}",
      "",
    ].join("\n");

    expect(output).toBe(expected);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("attaches indented comments to the preceding declaration", () => {
    const input = readFileSync(
      new URL("../fixtures/indented-post-declaration-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = [
      "module IndentedPostDeclarationComments {",
      "  var votes: str -> Set[(int, int)]",
      "      // votes[a] is the set of votes cast by acceptor a",
      "  var maxBal: str -> int",
      "      // maxBal[a] is a ballot number. Acceptor a will cast",
      "      // further votes only in ballots numbered greater than maxBal[a]",
      "}",
      "",
    ].join("\n");

    expect(output).toBe(expected);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing module-body comment", () => {
    const input = readFileSync(
      new URL("../fixtures/trailing-module-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line before trailing module comments", () => {
    const input = readFileSync(
      new URL("../fixtures/module-trailing-comment-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "  pure val answer = 42\n\n  // Run this example with the simulator.\n  // Additional command details follow here.",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves trailing source comments", () => {
    const input = readFileSync(
      new URL("../fixtures/trailing-source-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment inside an otherwise empty module", () => {
    const input = "module Example {\n// Intentionally empty\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an inline block comment", () => {
    const input = "module Example {\n  val total = 1/* left */+2\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
