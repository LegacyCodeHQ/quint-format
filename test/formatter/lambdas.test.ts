import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("lambdas", () => {
  test("formats lambda parameter forms", () => {
    const input = readFileSync(new URL("../fixtures/lambdas.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses a four-space continuation for a multiline lambda body", () => {
    const input = readFileSync(
      new URL("../fixtures/four-space-lambda-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline call with a lambda argument", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-lambda-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("names.forall(name =>\n    names.contains(name)\n  )");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("indents a multiline lambda within a UFCS call", () => {
    const input = readFileSync(
      new URL("../fixtures/ufcs-multiline-lambda.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const dedented = input
      .replace("\n            { id: value }", "\n        { id: value }")
      .replace("\n          )", "\n      )");

    expect(output).toBe(input);
    expect(checkQuint(dedented, "input.qnt").map(({ rule }) => rule)).toEqual(
      expect.arrayContaining(["format/lambda-body-indentation", "format/call-delimiter-spacing"]),
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses a four-space leading operator continuation in a lambda", () => {
    const input = readFileSync(
      new URL("../fixtures/preserved-lambda-implies.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "  pure val valid = Set(1, 2).forall(value =>\n    (value > 0)\n        implies (value >= 1)\n  )",
    );
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/binary-operator-indentation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps a secondary lambda header beside the call opening", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-secondary-lambda.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps leading call arguments beside a multiline lambda", () => {
    const input = readFileSync(
      new URL("../fixtures/hanging-lambda-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("stabilizes lambda indentation when its call expands", () => {
    const input = readFileSync(
      new URL("../fixtures/fold-lambda-call-expansion.qnt", import.meta.url),
      "utf8",
    );
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

  test("propagates multiline layout through nested lambda calls", () => {
    const input = readFileSync(
      new URL("../fixtures/nested-lambda-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      '    lhs.bind(left =>\n      rhs.bind(right =>\n        if (left == right)\n          Ok(left)\n        else\n          Err("different")\n      )\n    )',
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps a block-bodied lambda brace beside its arrow", () => {
    const input = readFileSync(
      new URL("../fixtures/block-lambda-postfix.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "    ((x, y) => {\n      val result = x - y\n      if (result < 0) -result else result\n    }).app(lhs, rhs)",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a compact single-expression lambda block", () => {
    const input = readFileSync(
      new URL("../fixtures/compact-lambda-block.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps a record-returning lambda's braces attached", () => {
    const input = readFileSync(
      new URL("../fixtures/record-lambda-braces.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        '  pure val records = Set("one").mapBy(name => {',
        "    name: name,",
        "    count: 1",
        "  })",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(checkQuint(input, "unformatted.qnt")).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps block-combinator lambda bodies attached", () => {
    const input = readFileSync(
      new URL("../fixtures/combinator-lambda-braces.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    for (const combinator of ["all", "any", "and", "or"]) {
      expect(output).toContain(`exists(value => ${combinator} {`);
    }
    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a lambda body", () => {
    const input = readFileSync(new URL("../fixtures/lambda-comment.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this lambda comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
