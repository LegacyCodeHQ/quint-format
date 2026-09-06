import { expect, test } from "bun:test";
import { nextFileAfterRemoval } from "../src/web/file-navigation.js";

test("selects the following visible file after approval removes the current file", () => {
  expect(nextFileAfterRemoval(["first.qnt", "current.qnt", "next.qnt"], "current.qnt")).toBe(
    "next.qnt",
  );
});

test("falls back to the preceding file when approving the final visible file", () => {
  expect(nextFileAfterRemoval(["first.qnt", "current.qnt"], "current.qnt")).toBe("first.qnt");
});

test("returns no selection after approving the sole visible file", () => {
  expect(nextFileAfterRemoval(["current.qnt"], "current.qnt")).toBeUndefined();
});
