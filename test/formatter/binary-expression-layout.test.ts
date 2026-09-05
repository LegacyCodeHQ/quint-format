import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("binary expression layout", () => {
  test("preserves a comment before a binary right operand", () => {
    const input = readFileSync(
      new URL("../fixtures/binary-right-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this right operand comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a same-line comment after a binary operator", () => {
    const input = readFileSync(
      new URL("../fixtures/binary-operator-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a line break after a binary operator", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-binary-expression.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    true and\n        false");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses a four-space right-operand continuation", () => {
    const input = readFileSync(
      new URL("../fixtures/binary-right-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const twoSpaceContinuation = input.replace("\n          true", "\n        true");

    expect(output).toBe(input);
    expect(
      checkQuint(twoSpaceContinuation, "input.qnt").map((diagnostic) => diagnostic.rule),
    ).toContain("format/binary-operator-indentation");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a leading binary continuation in a block combinator", () => {
    const input = readFileSync(
      new URL("../fixtures/block-leading-binary-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const twoSpaceContinuation = input.replace("\n        implies", "\n      implies");

    expect(output).toBe(input);
    expect(
      checkQuint(twoSpaceContinuation, "input.qnt").map((diagnostic) => diagnostic.rule),
    ).toContain("format/binary-operator-indentation");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a binary right-operand continuation in a block combinator", () => {
    const input = readFileSync(
      new URL("../fixtures/block-binary-right-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const twoSpaceContinuation = input.replace("\n        1 == 1", "\n      1 == 1");

    expect(output).toBe(input);
    expect(
      checkQuint(twoSpaceContinuation, "input.qnt").map((diagnostic) => diagnostic.rule),
    ).toContain("format/binary-operator-indentation");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a three-line binary expression in an ordinary block", () => {
    const input = readFileSync(
      new URL("../fixtures/three-line-binary-expression.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const shallowOperator = input.replace("\n          implies", "\n        implies");
    const shallowOperand = input.replace("\n              first != 0", "\n            first != 0");

    expect(output).toBe(input);
    expect(checkQuint(shallowOperator, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/binary-operator-indentation",
    );
    expect(checkQuint(shallowOperand, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/binary-operator-indentation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a nested-definition right operand", () => {
    const input = readFileSync(
      new URL("../fixtures/binary-nested-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const shallowOperand = input.replace("\n        val selected", "\n      val selected");

    expect(output).toBe(input);
    expect(checkQuint(shallowOperand, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/binary-operator-indentation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a binary continuation in a lambda body", () => {
    const input = readFileSync(
      new URL("../fixtures/lambda-binary-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
