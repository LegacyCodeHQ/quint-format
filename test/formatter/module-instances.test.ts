import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("module instances", () => {
  test("formats module instances and overrides", () => {
    const input = readFileSync(new URL("../fixtures/module-instance.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments among module instance overrides", () => {
    const input = readFileSync(
      new URL("../fixtures/instance-override-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this override comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments on module instance overrides", () => {
    const input = readFileSync(
      new URL("../fixtures/instance-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats anonymous instances", () => {
    const input = readFileSync(
      new URL("../fixtures/anonymous-instance.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an expanded anonymous instance", () => {
    const input = readFileSync(
      new URL("../fixtures/expanded-instance-import.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments in anonymous instance overrides", () => {
    const input = readFileSync(
      new URL("../fixtures/anonymous-instance-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this anonymous override comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments on anonymous instance overrides", () => {
    const input = readFileSync(
      new URL("../fixtures/anonymous-instance-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
