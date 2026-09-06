import { expect, test } from "bun:test";
import { changedBlocks, sourceLines } from "../src/changes.js";

test("highlights only changed blocks separated by unchanged lines", () => {
  expect(
    changedBlocks(
      "module M {\n  val x=1\n  val y = 2\n  val z=3\n}\n",
      "module M {\n  val x = 1\n  val y = 2\n  val z = 3\n}\n",
    ),
  ).toEqual([
    { before: { start: 1, end: 2 }, after: { start: 1, end: 2 } },
    { before: { start: 3, end: 4 }, after: { start: 3, end: 4 } },
  ]);
});

test("handles inserted/deleted lines and final newline changes", () => {
  expect(changedBlocks("a\nb\n", "a\nx\nb\n")).toEqual([
    { before: { start: 1, end: 1 }, after: { start: 1, end: 2 } },
  ]);
  expect(changedBlocks("a\nx\nb\n", "a\nb\n")).toEqual([
    { before: { start: 1, end: 2 }, after: { start: 1, end: 1 } },
  ]);
  expect(changedBlocks("a", "a\n")).toEqual([
    { before: { start: 0, end: 1 }, after: { start: 0, end: 1 } },
  ]);
  expect(changedBlocks("", "a\n")).toEqual([
    { before: { start: 0, end: 0 }, after: { start: 0, end: 1 } },
  ]);
  expect(changedBlocks("same\n", "same\n")).toEqual([]);
});

test("exposes a final newline as an empty row in the viewer", () => {
  expect(sourceLines("first\nlast\n")).toEqual(["first\n", "last\n", ""]);
  expect(sourceLines("first\nlast")).toEqual(["first\n", "last"]);
});

test("unchanged gaps are exact matches, including repeated lines and Unicode", () => {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let trial = 0; trial < 200; trial++) {
    const a = Array.from({ length: random() % 30 }, () => `${random() % 6} 🌍\n`);
    const b = [...a];
    for (let i = 0; i < 5; i++)
      b.splice(random() % (b.length + 1), random() % 3, `${random() % 6} 🌍\n`);
    let left = 0;
    let right = 0;
    for (const block of changedBlocks(a.join(""), b.join(""))) {
      expect(a.slice(left, block.before.start)).toEqual(b.slice(right, block.after.start));
      expect(a.slice(block.before.start, block.before.end)).not.toEqual(
        b.slice(block.after.start, block.after.end),
      );
      left = block.before.end;
      right = block.after.end;
    }
    expect(a.slice(left)).toEqual(b.slice(right));
  }
  expect(sourceLines("a\r\nb\nlast").join("")).toBe("a\r\nb\nlast");
});

test("large unchanged and repetitive files remain bounded", () => {
  const source = "repeated\n".repeat(20_000);
  expect(changedBlocks(source, source)).toEqual([]);
  expect(changedBlocks(source, "different\n".repeat(20_000))).toEqual([
    { before: { start: 0, end: 20_000 }, after: { start: 0, end: 20_000 } },
  ]);
});
