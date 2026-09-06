import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("call expressions", () => {
  test("formats a call expression", () => {
    const input = "module Example {\n  val values = Set( 1 ,2, )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves argument groups in a multiline call", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-call-groups.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a partially expanded call within the line width", () => {
    const input = readFileSync(
      new URL("../fixtures/partially-expanded-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a hanging partially expanded call", () => {
    const input = readFileSync(
      new URL("../fixtures/hanging-partially-expanded-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves leading argument breaks when the closing parenthesis is attached", () => {
    const input = readFileSync(
      new URL("../fixtures/leading-expanded-call-with-attached-close.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = [
      "module Example {",
      "  pure def listContains(__list: List[a], __elem: a): bool =",
      "    __list.foldl(",
      "        false,",
      "        (__acc, __i) => __acc or __i == __elem)",
      "}",
      "",
    ].join("\n");

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

  test("preserves a leading call argument beside the opening parenthesis", () => {
    const input = readFileSync(
      new URL("../fixtures/inline-leading-call-argument.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("normalizes an aligned multiline call while preserving argument groups", () => {
    const input = readFileSync(
      new URL("../fixtures/aligned-multiline-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        "  pure val result = Set(",
        '      "source-chain-state-with-a-long-name", "denomination-with-a-long-name", "amount-with-a-long-name",',
        '      "sender", "receiver",',
        '      "transfer", "channel-topology-with-a-long-name",',
        '      "zero", "zero"',
        "  )",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a fully expanded call", () => {
    const input = readFileSync(new URL("../fixtures/expanded-call.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comma in a fully expanded call", () => {
    const input = readFileSync(
      new URL("../fixtures/expanded-call-trailing-comma.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "input.qnt")).toEqual([]);
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

  test("preserves a fully expanded two-argument call", () => {
    const input = readFileSync(
      new URL("../fixtures/expanded-two-argument-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses a four-space continuation indent for expanded call arguments", () => {
    const input = readFileSync(
      new URL("../fixtures/call-continuation-indent.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const twoSpaceArguments = input.replaceAll("\n          ", "\n        ");

    expect(output).toBe(input);
    expect(
      checkQuint(twoSpaceArguments, "input.qnt").map((diagnostic) => diagnostic.rule),
    ).toContain("format/call-argument-indentation");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves explicitly multiline calls nested in a multiline call", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-multiline-calls.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("indents a nested multiline call inside a UFCS continuation", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-call-in-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = [
      "module Example {",
      "  action init = true",
      "  action step(values: Set[int]): bool = true",
      "",
      "  run execution =",
      "      init",
      "          // Explain the first transition.",
      "          // Keep this attached to the call.",
      "          .then(step(Set(",
      "              1,",
      "              2",
      "          )))",
      "}",
      "",
    ].join("\n");
    const diagnosticRules = checkQuint(input, "input.qnt").map(({ rule }) => rule);

    expect(output).toBe(expected);
    expect(diagnosticRules).toContain("format/call-argument-indentation");
    expect(diagnosticRules).toContain("format/call-delimiter-spacing");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a call argument", () => {
    const input = readFileSync(
      new URL("../fixtures/call-argument-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this call argument comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves trailing comments on expanded call arguments", () => {
    const input = readFileSync(
      new URL("../fixtures/call-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const extraSpace = input.replace("1, // a", "1,  // a");

    expect(output).toBe(input);
    expect(checkQuint(input, "input.qnt")).toEqual([]);
    expect(checkQuint(extraSpace, "input.qnt").map(({ rule }) => rule)).toEqual([
      "format/call-trailing-comment-spacing",
    ]);
    expect(formatQuint(extraSpace)).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("preserves aligned trailing comments on expanded call arguments", () => {
    const input = readFileSync(
      new URL("../fixtures/aligned-call-trailing-comments.qnt", import.meta.url),
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

  test("preserves blank lines between commented call argument groups", () => {
    const input = readFileSync(
      new URL("../fixtures/separated-call-argument-groups.qnt", import.meta.url),
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
});
