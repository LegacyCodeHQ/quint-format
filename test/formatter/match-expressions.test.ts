import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

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

  test("joins a line-broken match arrow with one space", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arrow-line-break.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("        | Internal(number) => number");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
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

    expect(output).toContain("action step =\n      match status {");
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

  test("aligns inline block-combinator bodies with the match case", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arm-block-indentation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "match-arm-block-indentation.qnt")).toEqual([]);
    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("aligns inline block-combinator bodies in nested matches", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-match-arm-block-combinator.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "nested-match-arm-block-combinator.qnt")).toEqual([]);
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

  test("aligns an ordinary block body with the match case", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arm-block-baseline.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const pipeAligned = [
      "module Example {",
      "  type Proof = Found(int) | Missing",
      "",
      "  pure def verify(proof: Proof): bool =",
      "    match proof {",
      "      | Found(value) => {",
      "        value > 0",
      "      }",
      "      | Missing => false",
      "    }",
      "}",
      "",
    ].join("\n");
    expect(formatQuint(pipeAligned)).toBe(input);
    expect(checkQuint(pipeAligned, "pipe-aligned-block.qnt")).toMatchSnapshot();
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("preserves a nested match arm body baseline", () => {
    const input = readFileSync(
      new URL("../fixtures/structural-match-arm-bodies.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "structural-match-arm-bodies.qnt")).toEqual([]);
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

  test("preserves line-broken match arm baselines at every nesting level", () => {
    const input = readFileSync(
      new URL("../fixtures/deep-line-broken-matches.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const overIndented = input
      .replace("\n          match second {", "\n            match second {")
      .replace("\n              match third {", "\n                match third {");

    expect(checkQuint(input, "deep-line-broken-matches.qnt")).toEqual([]);
    expect(
      checkQuint(overIndented, "over-indented-matches.qnt").filter(
        ({ rule }) => rule === "format/match-arm-body-indentation",
      ),
    ).toHaveLength(2);
    expect(formatQuint(overIndented)).toBe(input);
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

  test("uses a four-space continuation for a line-broken match arm expression", () => {
    const input = readFileSync(
      new URL("../fixtures/match-arm-expression-continuation.qnt", import.meta.url),
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

  test("preserves record literal match-arm body indentation", () => {
    const input = readFileSync(
      new URL("../fixtures/record-match-arm-body.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "record-match-arm-body.qnt")).toEqual([]);
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

  test("preserves nested record literal match-arm body indentation", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-record-match-arms.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "nested-record-match-arms.qnt")).toEqual([]);
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

    expect(output).toContain("    | Waiting =>        // Explain this arm.\n      2");
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

    expect(output).toContain("| Ready =>\n            1 // Ready has a value");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
