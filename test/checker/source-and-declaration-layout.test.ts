import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("source and declaration layout", () => {
    test("reports a compact module after a hashbang", () => {
      const result = checkFixture("hashbang.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical multiple-module layout", () => {
      const result = checkFixture("multiple-modules.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("accepts adjacent definitions without a blank line", () => {
      const result = checkFixture("definition-spacing.qnt");

      expect(result.kind).toBe("clean");
      expect(result.diagnostics).toEqual([]);
      expect(result.rendered).toBe("");
    });
  });
});
