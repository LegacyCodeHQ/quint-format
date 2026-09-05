import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("declarations and type expressions", () => {
  test("indents a variable declaration in a module", () => {
    const input = "module Example {\nvar n: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing after a type colon", () => {
    const input = "module Example {\n  var n:int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes spacing before a type colon", () => {
    const input = "module Example {\n  var n : int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing after var", () => {
    const input = "module Example {\n  var   n: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a constant declaration", () => {
    const input = "module Example {\nconst N: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a Set type", () => {
    const input = "module Example {\n  const Values:Set[ int ]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a tuple type", () => {
    const input = "module Example {\n  const Pair:( int ,str )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a record type", () => {
    const input = "module Example {\n  const User:{ name: str,active:bool }\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline record type", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-record-type.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("type Account = {\n    owner: str,\n    balance: int,\n  }");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("adds a missing trailing comma to a multiline record type", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-record-type-missing-comma.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "input.qnt").map(({ rule }) => rule)).toEqual([
      "format/multiline-record-separator",
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

  test("preserves comments in a record type", () => {
    const input = readFileSync(
      new URL("../fixtures/record-type-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this field comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments in a record type", () => {
    const input = readFileSync(
      new URL("../fixtures/record-type-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an empty record type", () => {
    const input = readFileSync(
      new URL("../fixtures/empty-record-type.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an open record type", () => {
    const input = "module Example {\n  const User:{ name: str|r }\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a function type", () => {
    const input = "module Example {\n  const mapper:int->str\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an operator type", () => {
    const input = "module Example {\n  const predicate:( int ,str )=>bool\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a zero-parameter operator type", () => {
    const input = "module Example {\n  const thunk: ( ) => bool\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a direct operator type", () => {
    const input = "module Example {\n  const predicate:int=>bool\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parenthesized type", () => {
    const input = "module Example {\n  const values: ( Set[ int ] )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a unit type", () => {
    const input = "module Example {\n  const empty: ( )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("places declarations on separate lines", () => {
    const input = "module Example {\n  var a: int  var b: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
