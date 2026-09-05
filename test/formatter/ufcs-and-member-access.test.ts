import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("UFCS and member access", () => {
  test("formats a UFCS call expression", () => {
    const input = "module Example {\n  val count = Set(1).size( )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned dots in a multiline UFCS chain", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-ufcs-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "run trace =\n    init.then(step)\n        .then(step)\n        .then(all {",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves all aligned dots in a nondet UFCS chain", () => {
    const input = readFileSync(
      new URL("../fixtures/nondet-multiline-ufcs-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "      Set(1, 2, 3)\n          .filter(value => value > 1)\n          .oneOf()",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a single multiline UFCS continuation", () => {
    const input = readFileSync(
      new URL("../fixtures/single-ufcs-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      'pure val error = ensure(true, "first message")\n      .andEnsure(false, "second message")',
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses a four-space structural indent for UFCS continuations", () => {
    const input = readFileSync(
      new URL("../fixtures/four-space-ufcs-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        '    nondet key = Set("one")',
        "        .oneOf()",
        "    val updated = states",
        "        .set(key, 1)",
        "    states' = states",
        "        .set(key, updated.get(key))",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(checkQuint(input, "unformatted.qnt")).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an index expression", () => {
    const input = "module Example {\n  val first = List(1, 2)[ 0 ]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a field-access expression", () => {
    const input = "module Example {\n  val answer = { value: 1 } . value\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a field selector", () => {
    const input = readFileSync(
      new URL("../fixtures/field-access-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this chain comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("aligns comments with a continued UFCS selector", () => {
    const input = readFileSync(
      new URL("../fixtures/commented-ufcs-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const shallowContinuation = input.replaceAll("\n        ", "\n      ");

    expect(output).toBe(input);
    expect(checkQuint(shallowContinuation, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/field-access-indentation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
