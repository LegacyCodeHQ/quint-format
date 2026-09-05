import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("conditional expressions", () => {
    test("reports noncanonical conditional formatting", () => {
      const result = checkFixture("conditional-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical conditional-comment formatting", () => {
      const result = checkFixture("conditional-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical conditional-consequence comment formatting", () => {
      const result = checkFixture("conditional-consequence-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
