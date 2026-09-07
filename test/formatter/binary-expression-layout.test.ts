import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

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

    expect(output).toContain("      true and\n          false");
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

  test("uses a four-space continuation for a multiline lambda right operand", () => {
    const input = readFileSync(
      new URL("../fixtures/binary-multiline-lambda-right-operand.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = input.replaceAll("\n      ", "\n        ");

    expect(output).toBe(expected);
    expect(checkQuint(input, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/binary-operator-indentation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("uses four-space implies continuations at every nesting level", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-implies-continuations.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("preserves a multiline map value after the arrow", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-map-value.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(checkQuint(input, "input.qnt")).toEqual([]);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("preserves a leading binary continuation in an expanded call argument", () => {
    const input = readFileSync(
      new URL("../fixtures/expanded-call-binary-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const shallowOperator = input.replace("\n            == 1", "\n          == 1");

    expect(output).toBe(input);
    expect(checkQuint(input, "input.qnt")).toEqual([]);
    expect(checkQuint(shallowOperator, "input.qnt").map(({ rule }) => rule)).toEqual([
      "format/binary-operator-indentation",
    ]);
    expect(formatQuint(shallowOperator)).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
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

  test("preserves a leading binary continuation inside a block entry call", () => {
    const input = readFileSync(
      new URL("../fixtures/block-call-binary-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const shallowOperator = input.replace("\n          == 3", "\n        == 3");

    expect(output).toBe(input);
    expect(checkQuint(input, "input.qnt")).toEqual([]);
    expect(checkQuint(shallowOperator, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/binary-operator-indentation",
    );
    expect(formatQuint(shallowOperator)).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
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

  test("aligns multiline match operands at the same level", () => {
    const input = readFileSync(
      new URL("../fixtures/match-binary-peers.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const overIndented = input
      .replace("\n    and", "\n        and")
      .replace("\n    match right", "\n            match right");

    expect(output).toBe(input);
    expect(checkQuint(overIndented, "input.qnt").map(({ rule }) => rule)).toEqual([
      "format/binary-operator-indentation",
      "format/binary-operator-indentation",
    ]);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
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
