import { describe, expect, test } from "bun:test";
import { parseQuint } from "@/parsing/parser.js";
import { indexSourceLayout } from "@/parsing/source-layout.js";

describe("source layout", () => {
  test("indexes node spans and the line spacing between nodes", () => {
    const root = parseQuint(`module Example {
  val first = 1

  val second = {
    2
  }
}`);
    const [first, second] = root.namedChildren[0]?.namedChildren.filter((node) =>
      ["value_definition", "operator_definition"].includes(node.type),
    ) ?? [undefined, undefined];
    if (!first || !second) throw new Error("Expected two definitions");

    const layout = indexSourceLayout(root);

    expect(layout.factsFor(first)).toMatchObject({ multiline: false, lineSpan: 1 });
    expect(layout.factsFor(second)).toMatchObject({ multiline: true, lineSpan: 3 });
    expect(layout.lineBreaksBetween(first, second)).toBe(2);
    expect(layout.blankLinesBetween(first, second)).toBe(1);
    expect(layout.hasLineBreakBetween(first, second)).toBe(true);
    expect(layout.areOnSameLine(first, second)).toBe(false);
  });
});
