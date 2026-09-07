import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("local definitions and nondeterminism", () => {
  test("formats a nondeterministic binding", () => {
    const input = readFileSync(new URL("../fixtures/nondet-binding.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats nested definitions", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-definitions.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves compact nondet sequences with semicolons", () => {
    const input = readFileSync(
      new URL("../fixtures/inline-nondet-sequence.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a compact block after a nested definition", () => {
    const input = readFileSync(
      new URL("../fixtures/compact-nested-block.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line before a nested definition body", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-definition-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    pure val doubled = value * 2\n\n    doubled + 1");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line after a nested operator definition", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-operator-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("      items.append(1)\n    }\n\n    appendOne(values)");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a nested definition below an action header", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-nested-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    nondet value = Set(1, 2, 3).oneOf()\n    all {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses continuation indentation for a local operator body", () => {
    const input = readFileSync(
      new URL("../fixtures/local-operator-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected =
      "module Example {\n  pure def check(values: Set[int]): bool = {\n    pure def allPositive(items: Set[int]): bool =\n        items.forall(element =>\n            element > 0)\n    allPositive(values)\n  }\n}\n";

    expect(output).toBe(expected);
    expect(checkQuint(input, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/definition-body-indentation",
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

  test("preserves an expanded local operator parameter list", () => {
    const input = readFileSync(
      new URL("../fixtures/local-expanded-parameters.qnt", import.meta.url),
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

  test("preserves a local return type below the definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/local-line-broken-return-type.qnt", import.meta.url),
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

  test("preserves one space before an inline local return type", () => {
    const input = readFileSync(
      new URL("../fixtures/spaced-local-return-type.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(input, "input.qnt")).toEqual([]);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses continuation indentation for line-broken match bodies", () => {
    const input = readFileSync(
      new URL("../fixtures/local-match-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = input
      .replace("\n              match child {", "\n                match child {")
      .replace("\n                | Some(value)", "\n                  | Some(value)")
      .replace("\n                | None", "\n                  | None")
      .replace(
        "\n              }\n            childOK",
        "\n                }\n            childOK",
      );

    expect(checkQuint(input, "local-match-continuation.qnt").map(({ rule }) => rule)).toContain(
      "format/definition-body-indentation",
    );
    expect(output).toBe(expected);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("uses continuation indentation for module and local value bodies", () => {
    const input = readFileSync(
      new URL("../fixtures/value-continuations.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = input
      .replace("\n    Set(1, 2, 3)", "\n      Set(1, 2, 3)")
      .replace("\n      selected.filter", "\n        selected.filter");

    expect(output).toBe(expected);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("preserves a comment after a nested definition", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-definition-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line between leading body comment groups", () => {
    const input = readFileSync(
      new URL("../fixtures/separated-leading-body-comments.qnt", import.meta.url),
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

  test("preserves a blank line between leading comments and the nested body", () => {
    const input = readFileSync(
      new URL("../fixtures/separated-leading-comments-from-body.qnt", import.meta.url),
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

  test("keeps an explanatory comment block attached after a multiline local definition", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-local-comment-gap.qnt", import.meta.url),
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

  test("keeps a single instruction comment attached after a multiline local definition", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-local-instruction-comment.qnt", import.meta.url),
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

  test("preserves a blank line before a commented local definition", () => {
    const input = readFileSync(
      new URL("../fixtures/local-definition-comment-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comment on a local definition", () => {
    const input = readFileSync(
      new URL("../fixtures/local-definition-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this local comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments on local definitions", () => {
    const input = readFileSync(
      new URL("../fixtures/aligned-local-definition-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a local definition body", () => {
    const input = readFileSync(
      new URL("../fixtures/local-definition-body-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this local body comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
