import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("destructuring patterns", () => {
    test("reports noncanonical tuple-pattern formatting", () => {
      const result = checkFixture("tuple-pattern.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical tuple-pattern comment formatting", () => {
      const result = checkFixture("tuple-pattern-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical record-pattern formatting", () => {
      const result = checkFixture("record-pattern.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
