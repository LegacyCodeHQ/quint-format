import { describe, expect, test } from "bun:test";

describe("test harness", () => {
  test("runs regular assertions", () => {
    expect(1 + 1).toBe(2);
  });
});
