import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("lambdas", () => {
    test("reports noncanonical lambda formatting", () => {
      const result = checkFixture("lambda-check.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical lambda-comment formatting", () => {
      const result = checkFixture("lambda-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
