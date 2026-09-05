import { describe, expect, test } from "bun:test";
import { checkQuint, formatQuint } from "../../src/index";

describe("arithmetic expressions", () => {
  test("formats an integer subtraction expression", () => {
    const input = "module Example {\nval delta=3-1\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
