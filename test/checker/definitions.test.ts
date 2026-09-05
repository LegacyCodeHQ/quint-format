import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("definitions", () => {
    test("reports noncanonical general assumption formatting", () => {
      const result = checkFixture("assumption-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical parameterless def formatting", () => {
      const result = checkFixture("def-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical def-parameter formatting", () => {
      const result = checkFixture("def-parameter.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical ignored-parameter formatting", () => {
      const result = checkFixture("hole-parameter.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical multiple-def-parameter formatting", () => {
      const result = checkFixture("multiple-def-parameters.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical typed-def-header formatting", () => {
      const result = checkFixture("typed-def-header.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports a noncanonical untyped parameter with a return type", () => {
      const result = checkFixture("untyped-parameter-return.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical List-typed-header formatting", () => {
      const result = checkFixture("list-typed-header.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports an optional definition semicolon", () => {
      const result = checkFixture("definition-semicolon.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
