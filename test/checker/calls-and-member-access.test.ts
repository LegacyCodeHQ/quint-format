import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("calls and member access", () => {
    test("reports noncanonical call-expression formatting", () => {
      const result = checkFixture("call-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical call-argument comment formatting", () => {
      const result = checkFixture("call-argument-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical UFCS-call formatting", () => {
      const result = checkFixture("ufcs-call.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical index-expression formatting", () => {
      const result = checkFixture("index-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical field-access formatting", () => {
      const result = checkFixture("field-access.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical field-access comment formatting", () => {
      const result = checkFixture("field-access-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
