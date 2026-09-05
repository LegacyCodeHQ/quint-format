import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("value definitions and literals", () => {
  test("formats an integer value definition", () => {
    const input = "module Example {\nval answer = 42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes an optional value semicolon", () => {
    const input = "module Example {\n  val answer=42;\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a Boolean value definition", () => {
    const input = "module Example {\nval ready = true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a string value definition", () => {
    const input = 'module Example {\nval greeting = "hello"\n}\n';
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a typed value definition", () => {
    const input = "module Example {\nval answer:int=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an integer addition expression", () => {
    const input = "module Example {\nval total=1+2\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an identifier value expression", () => {
    const input = "module Example {\nconst source: int\nval copy=source\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a unit literal", () => {
    const input = "module Example {\n  val empty = ( )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a list literal", () => {
    const input = "module Example {\n  val values = [ 1 ,2, ]\n}\n";
    const output = formatQuint(input);
    const compact = "module Example {\n  val values = [1, 2]\n}\n";
    const padded = "module Example {\n  val values = [ 1, 2 ]\n}\n";

    expect(output).toBe(compact);
    expect(checkQuint(compact, "formatted.qnt")).toEqual([]);
    expect(checkQuint(padded, "input.qnt").map(({ rule }) => rule)).toEqual([
      "format/expression-delimiter-spacing",
      "format/expression-delimiter-spacing",
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

  test("preserves an explicitly expanded list literal", () => {
    const input = readFileSync(new URL("../fixtures/expanded-list.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a tuple literal", () => {
    const input = "module Example {\n  val pair = ( 1 ,2, )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a record literal", () => {
    const input = 'module Example {\n  val user = {name :"Alice" ,age:42, }\n}\n';
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes a trailing comma from a multiline record literal", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-record-literal.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const expected = input.replace("    balance: 0,\n", "    balance: 0\n");

    expect(checkQuint(input, "input.qnt")).toMatchSnapshot();
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

  test("preserves source-line groups in a multiline record literal", () => {
    const input = readFileSync(
      new URL("../fixtures/grouped-record-literal.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);

    const missingGroupSpace = input.replace('source: "alice", round', 'source: "alice",round');
    expect(checkQuint(missingGroupSpace, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/multiline-record-separator",
    );
  });

  test("formats a record spread", () => {
    const input = "module Example {\n  val extended = {b:2 ,... {a:1}}\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments in record literals", () => {
    const input = readFileSync(
      new URL("../fixtures/commented-record.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps a closing-delimiter comment with the final nested record field", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-record-closing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("second: 2 // Explain the second field.\n    },");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
