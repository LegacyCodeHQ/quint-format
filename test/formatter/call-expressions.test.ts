import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

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
        '      "zero", "zero",',
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
    const withoutTrailingComma = input.replace('      "bob" -> 2,\n', '      "bob" -> 2\n');

    expect(output).toBe(input);
    expect(checkQuint(withoutTrailingComma, "input.qnt")).toMatchSnapshot();
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
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
      "    init",
      "        // Explain the first transition.",
      "        // Keep this attached to the call.",
      "        .then(step(Set(",
      "            1,",
      "            2,",
      "        )))",
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
});
