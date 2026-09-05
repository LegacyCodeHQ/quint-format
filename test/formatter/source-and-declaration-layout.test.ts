import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "@/index.js";

describe("source and declaration layout", () => {
  test("preserves a source hashbang", () => {
    const input = "#!/usr/bin/env -S quint typecheck\nmodule Example {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats multiple top-level modules", () => {
    const input = "module First {} module Second {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves adjacent definitions", () => {
    const input = "module Example {\n  var first: int\n  var second: int\n}\n";
    const output = formatQuint(input);

    expect(output).toContain("  var first: int\n  var second: int");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("separates a braced definition from the next commented definition", () => {
    const input = readFileSync(
      new URL("../fixtures/commented-definition-separation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("  }\n\n  // Describe the following definition.");
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/commented-declaration-separation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("separates documented declaration groups", () => {
    const input = readFileSync(
      new URL("../fixtures/commented-declaration-groups.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "  const FIRST: int\n\n  // Second documented constant.\n  const SECOND: int\n\n  // Third documented constant,",
    );
    expect(output).toContain("  const THIRD: int\n  var state: int");
    expect(
      checkQuint(input, "input.qnt").filter(
        (diagnostic) => diagnostic.rule === "format/commented-declaration-separation",
      ),
    ).toHaveLength(2);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("normalizes excess spacing before a documented declaration", () => {
    const input = readFileSync(
      new URL("../fixtures/excess-documented-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "  pure val first = 1\n\n  // Second documented value.\n  pure val second = 2",
    );
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/commented-declaration-separation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line between grouped definitions", () => {
    const input = "module Example {\n  var first: int\n\n  var second: int\n}\n";
    const output = formatQuint(input);

    expect(output).toContain("  var first: int\n\n  var second: int");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
