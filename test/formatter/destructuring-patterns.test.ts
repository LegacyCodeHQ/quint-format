import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "../../src/index";

describe("destructuring patterns", () => {
  test("formats a tuple destructuring pattern", () => {
    const input = "module Example {\n  pure val ( first ,_ ) = (1, 2)\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments in a tuple destructuring pattern", () => {
    const input = readFileSync(
      new URL("../fixtures/tuple-pattern-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this tuple field comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a record destructuring pattern", () => {
    const input = "module Example {\n  pure val {first ,second} = { first: 1, second: 2 }\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
