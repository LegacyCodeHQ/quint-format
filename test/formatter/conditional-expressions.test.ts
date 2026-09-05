import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("conditional expressions", () => {
  test("formats a conditional expression", () => {
    const input = "module Example {\n  pure val answer = if( true )1  else  2\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves multiline unbraced conditional branches", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-conditional.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    if (condition)\n      1\n    else\n      2");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("expands inline results when else starts on a new line", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-inline-conditional.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("      if (flag)\n        1\n      else\n        2");
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/conditional-branch-spacing",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("expands result branches after a multiline condition", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-condition-branches.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      '    if ((value == 0)\n        or value == 1)\n      "SUCCESS"\n    else\n      "NOT_ENOUGH_TRUST"',
    );
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/conditional-branch-spacing",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses a four-space leading operator continuation in a conditional", () => {
    const input = readFileSync(
      new URL("../fixtures/preserved-condition-or.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain('    if ((value == 0)\n        or value == 1)\n      "SUCCESS"');
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/binary-operator-indentation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an explicit line break after else", () => {
    const input = readFileSync(
      new URL("../fixtures/explicit-else-break.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    } else\n      pure val nextValue = state.value + 1");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("joins else with an immediate nested conditional", () => {
    const input = readFileSync(new URL("../fixtures/else-if-chain.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain('    else if (value == 0)\n      "zero"\n    else\n      "positive"');
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/conditional-else-spacing",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a nested conditional as an else-if chain", () => {
    const input = readFileSync(
      new URL("../fixtures/trailing-else-if-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      '    if (value < 0)\n      "negative"\n    else if (value == 0)\n      "zero"\n    else\n      "positive"',
    );
    expect(checkQuint(input, "input.qnt")).toMatchSnapshot();
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("expands the first result in a conditional chain", () => {
    const input = readFileSync(
      new URL("../fixtures/expanded-chain-first-result.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain('    if (value < 0)\n      "NEGATIVE"\n    else if (value == 0)');
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("places a block-bodied conditional below a definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/block-if-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    if (ready) {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a block-bodied conditional beside a definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/same-line-block-if.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a conditional alternative", () => {
    const input = readFileSync(
      new URL("../fixtures/conditional-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this alternative comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comment on a conditional consequence", () => {
    const input = readFileSync(
      new URL("../fixtures/consequence-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comment on a nested definition", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-definition-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an inline comment after else", () => {
    const input = readFileSync(
      new URL("../fixtures/else-inline-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("places pre-else comments inside the alternative branch", () => {
    const input = readFileSync(
      new URL("../fixtures/comment-before-else.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      '    else if (second)\n      "SECOND"\n    else\n      // Explain the final fallback.\n      "THIRD"',
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("expands the consequence when the alternative has a comment", () => {
    const input = readFileSync(
      new URL("../fixtures/commented-else-expands-consequence.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "        if (flag)\n          1\n        else\n          // fallback result\n          2",
    );
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/conditional-branch-spacing",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a conditional consequence", () => {
    const input = readFileSync(
      new URL("../fixtures/conditional-consequence-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this consequence comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
