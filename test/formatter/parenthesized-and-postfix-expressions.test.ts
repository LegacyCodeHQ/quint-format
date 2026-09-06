import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("parenthesized and postfix expressions", () => {
  test("formats a parenthesized expression", () => {
    const input = "module Example {\nval total=(1+2)\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves local definitions in a multiline parenthesized expression", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-parenthesized-definitions.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves local definitions in a multiline UFCS argument", () => {
    const input = readFileSync(
      new URL("../fixtures/parenthesized-ufcs-local-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("attaches postfix access to a multiline parenthesized expression", () => {
    const input = readFileSync(
      new URL("../fixtures/parenthesized-postfix.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "    ((x, y) =>\n      val result = x * y\n      if (result > 0) result else 0\n    ).app(lhs, rhs)",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("attaches a parenthesized all expression to its postfix call", () => {
    const input = readFileSync(
      new URL("../fixtures/parenthesized-all-postfix.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("attaches a parenthesized ordinary block to its postfix call", () => {
    const input = readFileSync(
      new URL("../fixtures/parenthesized-block-postfix.qnt", import.meta.url),
      "utf8",
    );
    const separated = input.replace("  }).then", "  }\n  ).then");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(checkQuint(separated, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/parenthesized-postfix-delimiter",
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
});
