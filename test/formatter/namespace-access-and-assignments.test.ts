import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("namespace access and assignments", () => {
  test("formats namespace access", () => {
    const input = "module Example {\n  pure val apply = (Scope :: x)=>Scope :: x\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a primed assignment", () => {
    const input =
      "module Example {\n  var count: int\n\n  action increment = count '  =count + 1\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an explicit line break in a primed assignment chain", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-primed-assignment-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      '    state\' =\n      state.with("first", 1)\n          .with("second", 2),',
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
