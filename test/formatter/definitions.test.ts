import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("definitions", () => {
  test("formats a general assumption expression", () => {
    const input = "module Example {\n  const Flag: bool\n\n  assume Holds=Flag\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parameterless def definition", () => {
    const input = "module Example {\n  def answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a def parameter", () => {
    const input = "module Example {\n  def identity( value )=value\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an ignored def parameter", () => {
    const input = "module Example {\n  pure def ignore( _: int ): int = 0\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats multiple def parameters", () => {
    const input = "module Example {\n  def choose(left ,right)=left\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comma in a compact pure def parameter list", () => {
    const input = "module Example {\n  pure def choose(left :int ,right :int,):int=left\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("preserves an expanded pure def parameter list without a trailing comma", () => {
    const input = [
      "module Example {",
      "  pure def choose(",
      "    left: int,",
      "    right: int",
      "  ): int = left",
      "}",
      "",
    ].join("\n");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("formats a typed def header", () => {
    const input = "module Example {\n  def identity(value :int) :int=value\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a return type placed below the definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/line-broken-return-type.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const misaligned = input.replace("\n  : bool", "\n    : bool");
    expect(formatQuint(misaligned)).toBe(input);
    expect(checkQuint(misaligned, "misaligned-return-type.qnt")).toMatchSnapshot();
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("expands a multiline definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-definition-header.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        "  pure def transfer(",
        "    chainState: str,",
        "    denomination: str,",
        "    amount: int,",
        "    sender: str,",
        "    receiver: str,",
        "    sourcePort: str,",
        "    sourceChannel: str,",
        "    timeoutHeight: int,",
        "    timeoutTimestamp: int",
        "  ): bool = {",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    const diagnostics = checkQuint(input, "multiline-definition-header.qnt");
    expect([diagnostics[0], diagnostics.at(-1)]).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a long definition header written on one line", () => {
    const input = readFileSync(
      new URL("../fixtures/single-line-long-definition-header.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(namedParseTreeSignature(outputTree)).toEqual(namedParseTreeSignature(inputTree));
  });

  test("formats an untyped parameter with a return type", () => {
    const input = readFileSync(
      new URL("../fixtures/untyped-parameter-return.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats List types in a def header", () => {
    const input = "module Example {\n  def identity(xs: List[ int ]): List[ int ] = xs\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes an optional definition semicolon", () => {
    const input = "module Example {\n  def answer=42;\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
