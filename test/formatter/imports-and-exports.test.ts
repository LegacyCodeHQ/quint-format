import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "../../src/index";

describe("imports and exports", () => {
  test("formats named and wildcard imports and exports", () => {
    const input = readFileSync(new URL("../fixtures/imports-exports.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats source-qualified imports", () => {
    const input = readFileSync(new URL("../fixtures/source-imports.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps individually commented imports in one group", () => {
    const input = readFileSync(
      new URL("../fixtures/commented-import-group.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
