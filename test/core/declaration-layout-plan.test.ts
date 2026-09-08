import { describe, expect, test } from "bun:test";
import { analyzeSource } from "@/analysis/source-analyzer.js";
import { planDeclarationBoundary } from "@/formatting/declaration-spacing.js";

describe("declaration layout plans", () => {
  test("shares one boundary decision between rendering and diagnostics", () => {
    const analyzed = analyzeSource(`module Example {
  pure val first = {
    1
  }
  /// Second value.
  pure val second = {
    2
  }
}`);
    const [first, second] = analyzed.modules[0]?.declarations ?? [];
    if (!first || !second) throw new Error("Expected two declarations");

    expect(planDeclarationBoundary(first, second, analyzed.sourceLayout)).toMatchObject({
      actualLineBreaks: 1,
      expectedLineBreaks: 2,
      separation: "leading-comment",
      requiresNormalization: true,
    });
  });
});
