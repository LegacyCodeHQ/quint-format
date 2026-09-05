import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

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
});
