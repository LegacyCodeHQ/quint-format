import { describe, expect, test } from "bun:test";
import { checkFixture, checkSource } from "../support/check";

describe("checker diagnostics", () => {
  describe("modules and parse diagnostics", () => {
    test("reports a compact empty module", () => {
      const result = checkFixture("compact-empty-module.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports a missing module brace at end of file", () => {
      const result = checkFixture("missing-module-brace.qnt");

      expect(result.kind).toBe("syntax");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports every recoverable syntax error precisely", () => {
      const result = checkFixture("multiple-syntax-errors.qnt");

      expect(result.kind).toBe("syntax");
      expect(result.diagnostics).toHaveLength(2);
      expect(result.diagnostics.every(({ rule }) => rule === "parse/unexpected-token")).toBe(true);
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical spacing after the module keyword", () => {
      const result = checkFixture("module-keyword-spacing.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports missing spacing before the module brace", () => {
      const result = checkFixture("module-brace-spacing.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports an excess final newline", () => {
      const result = checkSource("module Example {\n}\n\n", "extra-final-newline.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
