import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("parenthesized and arithmetic expressions", () => {
    test("reports noncanonical parenthesized expression formatting", () => {
      const result = checkFixture("parenthesized-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical subtraction formatting", () => {
      const result = checkFixture("subtraction-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
