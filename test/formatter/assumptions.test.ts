import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("assumptions", () => {
  test("formats a Boolean assumption", () => {
    const input = "module Example {\nassume Safe = true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing around assumption equals", () => {
    const input = "module Example {\n  assume Safe=true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline assumption with a four-space continuation", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-assumption.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);
    const twoSpaceContinuation = input.replace("\n      Values", "\n    Values");

    expect(output).toBe(input);
    expect(checkQuint(twoSpaceContinuation, "input.qnt").map(({ rule }) => rule)).toContain(
      "format/definition-body-indentation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
