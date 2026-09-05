import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("namespace access and assignments", () => {
    test("reports noncanonical namespace-access formatting", () => {
      const result = checkFixture("namespace-access.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical primed-assignment formatting", () => {
      const result = checkFixture("primed-assignment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
