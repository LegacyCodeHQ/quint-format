import { describe, expect, test } from "bun:test";

describe("test harness", () => {
  test("runs regular assertions", () => {
    expect(1 + 1).toBe(2);
  });

  test("records snapshot approvals", () => {
    const formatted = ["module Example {", "  val answer = 42", "}"].join("\n");

    expect(formatted).toMatchSnapshot();
  });
});
