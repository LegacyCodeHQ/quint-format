import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("assumptions", () => {
    test("reports an unindented assumption", () => {
      const result = checkFixture("assumption-declaration.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical spacing around assumption equals", () => {
      const result = checkFixture("assumption-equals-spacing.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
