import { expect, test } from "bun:test";
import { formatQuint } from "../../../src/index.js";
import { compareSource } from "../src/comparison.js";
import { whitespaceDifference } from "../src/spacing.js";

test("identifies added and removed spaces precisely", () => {
  expect(whitespaceDifference("a b", "a   b")).toEqual({
    before: [],
    after: [{ start: 2, end: 4 }],
  });
  expect(whitespaceDifference("a   b", "a b")).toEqual({
    before: [{ start: 2, end: 4 }],
    after: [],
  });
});

test("distinguishes moved indentation while leaving line breaks to block highlighting", () => {
  expect(whitespaceDifference("a \nb", "a\n b")).toEqual({
    before: [{ start: 1, end: 2 }],
    after: [{ start: 2, end: 3 }],
  });
  expect(whitespaceDifference("a\nb", "a\n\nb")).toEqual({ before: [], after: [] });
});

test("comparison marks formatter spacing inside syntax gaps and comments", () => {
  const before = "module M{\n    /* first\n       second */\n    val x=1  +2\n}\n";
  const result = compareSource(before, formatQuint(before));
  expect(result.error).toBeUndefined();
  expect(result.mappingWarning).toBeUndefined();
  expect(result.spacing.after.length).toBeGreaterThan(0);
  expect(result.spacing.before.length).toBeGreaterThan(0);
  for (const side of ["before", "after"] as const) {
    const source = side === "before" ? result.before : (result.after ?? "");
    for (const range of result.spacing[side])
      expect(source.slice(range.start, range.end)).toMatch(/^[\t\v\f ]+$/u);
  }
});

test("unchanged horizontal whitespace receives no spacing highlight", () => {
  expect(whitespaceDifference("a \t b", "a \t b")).toEqual({ before: [], after: [] });
});
