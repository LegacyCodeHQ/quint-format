import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "@/index.js";

const parser = new Parser();
parser.setLanguage(Quint);

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

  test("preserves adjacent variable declarations", () => {
    const input = "module Example {\n  var first: int\n  var second: int\n}\n";
    const output = formatQuint(input);

    expect(output).toContain("  var first: int\n  var second: int");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves adjacent def declarations when the latter is undocumented", () => {
    const input = readFileSync(
      new URL("../fixtures/adjacent-definitions.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toContain("  pure def first(): int = 1\n  pure def second(): int = 2");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(input, "input.qnt")).toEqual([]);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    expect(parser.parse(input).rootNode.hasError).toBe(false);
    expect(parser.parse(output).rootNode.hasError).toBe(false);
  });

  test("preserves adjacent assumptions with label comments", () => {
    const input = readFileSync(
      new URL("../fixtures/adjacent-commented-assumptions.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    expect(parser.parse(input).rootNode.hasError).toBe(false);
    expect(parser.parse(output).rootNode.hasError).toBe(false);
  });

  test("separates adjacent multiline value definitions", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-definition-separation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "    right: 2\n  }\n\n  pure val second = {\n    left: 3,\n    right: 4\n  }\n\n  pure val third",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    expect(parser.parse(input).rootNode.hasError).toBe(false);
    expect(parser.parse(output).rootNode.hasError).toBe(false);
  });

  test("separates a multiline definition from a following type declaration", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-definition-type-separation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    } else {\n      EQ\n    }\n  }\n\n  type NodeIdToCompare = {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/definition-separation",
    );
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
    expect(parser.parse(input).rootNode.hasError).toBe(false);
    expect(parser.parse(output).rootNode.hasError).toBe(false);
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
