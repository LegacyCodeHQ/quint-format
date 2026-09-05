import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("imports and module instances", () => {
    test("reports noncanonical named and wildcard imports and exports", () => {
      const result = checkFixture("imports-exports.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical source-qualified imports", () => {
      const result = checkFixture("source-imports.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toContain("format/import-source-spacing");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical module instances and overrides", () => {
      const result = checkFixture("module-instance.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical instance-override comment formatting", () => {
      const result = checkFixture("instance-override-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical anonymous instances", () => {
      const result = checkFixture("anonymous-instance.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical anonymous-instance comment formatting", () => {
      const result = checkFixture("anonymous-instance-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
