import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("blocks and block combinators", () => {
  test("formats an ordinary block expression", () => {
    const input = "module Example {\n  var count: int\n\n  action initialize = {count' = 0}\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment inside an ordinary block", () => {
    const input = readFileSync(
      new URL("../fixtures/block-expression-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this block comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comment on an ordinary block result", () => {
    const input = readFileSync(
      new URL("../fixtures/block-result-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats all block combinators", () => {
    const input = readFileSync(
      new URL("../fixtures/block-combinators.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a compact block combinator", () => {
    const input = readFileSync(
      new URL("../fixtures/compact-block-combinator.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const compactWithoutSpaces = input.replace("any { first, second }", "any {first,second}");

    expect(output).toBe(input);
    expect(checkQuint(compactWithoutSpaces, "input.qnt").map(({ rule }) => rule)).toEqual(
      expect.arrayContaining([
        "format/block-combinator-brace-spacing",
        "format/block-combinator-separator-spacing",
      ]),
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves source-line groups in block combinators", () => {
    const input = readFileSync(
      new URL("../fixtures/grouped-combinator-entries.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    true, true, true,");
    expect(output).toContain("    true, false, true,");
    expect(output).toContain("    true, true, false,");
    expect(output).toContain("    false, false, true,");
    expect(output).toContain(
      [
        '    "first deliberately long value for width testing" == "first deliberately long value for width testing",',
        '    "second deliberately long value for width testing" == "second deliberately long value for width testing",',
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a block combinator below a definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-block-combinator-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    all {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes a blank line after a block combinator opening", () => {
    const input = readFileSync(
      new URL("../fixtures/block-combinator-opening-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action choose = any {\n    true,");
    expect(output).not.toContain("any {\n\n");
    expect(checkQuint(input, "input.qnt")).toMatchSnapshot();
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment inside a block combinator", () => {
    const input = readFileSync(
      new URL("../fixtures/combinator-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this conjunct comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comment on a block combinator opening", () => {
    const input = readFileSync(
      new URL("../fixtures/block-combinator-opening-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const missingSpace = input.replace("or { //", "or {//");

    expect(output).toBe(input);
    expect(checkQuint(missingSpace, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/block-combinator-opening-comment-spacing",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments in a block combinator", () => {
    const input = readFileSync(
      new URL("../fixtures/block-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("first' = 1,  // First value");
    expect(output).toContain("second' = 2, // Second value");
    expect(output).toContain("third' = 3,  // Third value");
    expect(output).toContain("fourth' = 4,  // Fourth value");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line between block combinator entries", () => {
    const input = readFileSync(new URL("../fixtures/block-entry-gap.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
