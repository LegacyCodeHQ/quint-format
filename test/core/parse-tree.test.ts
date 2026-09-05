import { describe, expect, test } from "bun:test";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("parse-tree preservation", () => {
  test("preserves named syntax, fields, and leaf values", () => {
    const input = "module Example{val values=Set(1,2)}";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(namedParseTreeSignature(parser.parse(output).rootNode)).toEqual(
      namedParseTreeSignature(parser.parse(input).rootNode),
    );
  });

  test("distinguishes normalized comment content", () => {
    const alpha = parser.parse(
      "module Example {\n  val values = Set(\n    // alpha\n    1\n  )\n}\n",
    );
    const beta = parser.parse(
      "module Example {\n  val values = Set(\n    // beta\n    1\n  )\n}\n",
    );

    expect(namedParseTreeSignature(alpha.rootNode)).not.toEqual(
      namedParseTreeSignature(beta.rootNode),
    );
  });
});
