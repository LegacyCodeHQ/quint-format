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

    test("accepts adjacent variable declarations without a blank line", () => {
      const result = checkFixture("definition-spacing.qnt");

      expect(result.kind).toBe("clean");
      expect(result.diagnostics).toEqual([]);
      expect(result.rendered).toBe("");
    });

    test("reports adjacent def declarations without a blank line", () => {
      const result = checkFixture("adjacent-definitions.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports adjacent multiline value definitions without blank lines", () => {
      const result = checkFixture("multiline-definition-separation.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
