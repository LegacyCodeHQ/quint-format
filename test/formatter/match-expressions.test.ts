import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("match expressions", () => {
  test("formats a match expression", () => {
    const input = readFileSync(
      new URL("../fixtures/match-expression.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a compact one-arm default match", () => {
    const input = readFileSync(
      new URL("../fixtures/compact-default-match.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("places a match expression below a definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/match-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    match status {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves match placement after a definition equals sign", () => {
    const input = readFileSync(
      new URL("../fixtures/match-definition-placement.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an inline multiline match used as a lambda body", () => {
    const input = readFileSync(
      new URL("../fixtures/inline-lambda-match.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("indents multiline match-arm bodies below their arms", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arm-block-indentation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "match-arm-block-indentation.qnt")).toMatchSnapshot();
    expect(output).toContain("| Ready => all {\n          n' = n,");
    expect(output).toContain("\n        }\n      | Waiting");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments between match arms", () => {
    const input = readFileSync(new URL("../fixtures/match-comment.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this arm comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a match-arm body", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arm-body-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this arm body comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an aligned comment after a match-arm arrow", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arrow-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline match-arm body with a trailing comment", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arm-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("| Ready =>\n          1 // Ready has a value");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
