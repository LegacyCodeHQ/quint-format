import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("match expressions", () => {
    test("reports noncanonical match-arm formatting", () => {
      const result = checkFixture("match-check.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports a match arrow on a separate line", () => {
      const result = checkFixture("match-arrow-line-break.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical match-comment formatting", () => {
      const result = checkFixture("match-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical match-arm-body comment formatting", () => {
      const result = checkFixture("match-arm-body-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical compact match spacing", () => {
      const result = checkFixture("match-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
