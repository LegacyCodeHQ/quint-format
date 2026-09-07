import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { parseQuintAst } from "../support/quint-ast.js";

const parser = new Parser();
parser.setLanguage(Quint);

describe("type declarations", () => {
  test("formats a primitive type alias", () => {
    const input = "module Example {\n  type Count=int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an uninterpreted type", () => {
    const input = "module Example {\n  type   DOMAIN\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a named type alias", () => {
    const input = "module Example {\n  type DOMAIN\n\n  type Copy=DOMAIN\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a polymorphic type alias", () => {
    const input = "module Example {\n  type Box[ a ]=List[a]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a function type alias continuation", () => {
    const input = "module Example {\n  type Listener[p] =\n    (List[p]) => Set[p]\n}\n";
    const expected = "module Example {\n  type Listener[p] =\n      (List[p]) => Set[p]\n}\n";
    const output = formatQuint(input);

    expect(output).toBe(expected);
    expect(output).toMatchSnapshot();
    expect(checkQuint(input, "input.qnt")).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a polymorphic type application", () => {
    const input = "module Example {\n  type Box[a] = List[a]\n\n  const boxes:Box[ int ]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an expanded type application", () => {
    const input = readFileSync(
      new URL("../fixtures/expanded-type-application.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an inline sum type", () => {
    const input = "module Example {\n  type Elem=S( str )|I( int )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a multiline sum type", () => {
    const input = "module Example {\n  type Option[a] =\n  | Some( a )\n   | None\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves the leading pipe on a multiline single-variant sum type", () => {
    const input =
      "module Example {\n  type Single =\n    | Only\n\n  val example: Single = Only\n}\n";
    const expected = input;
    const output = formatQuint(input);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;

    expect(output).toBe(expected);
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(parseQuintAst(output, "formatted.qnt")).toEqual(parseQuintAst(input, "input.qnt"));
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a leading pipe on an inline sum type", () => {
    const input = "module Example {\n  type Single = | Only\n\n  val example: Single = Only\n}\n";
    const output = formatQuint(input);
    const inputTree = parser.parse(input).rootNode;
    const outputTree = parser.parse(output).rootNode;

    expect(output).toBe(input);
    expect(inputTree.hasError).toBe(false);
    expect(outputTree.hasError).toBe(false);
    expect(parseQuintAst(output, "formatted.qnt")).toEqual(parseQuintAst(input, "input.qnt"));
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments between sum-type variants", () => {
    const input = readFileSync(
      new URL("../fixtures/sum-type-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this variant comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves trailing comments on sum-type variants", () => {
    const input = readFileSync(
      new URL("../fixtures/sum-type-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("| Self(str) // The name of someone who drew themself");
    expect(output).toContain("| Ok        // The draw was Ok");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
