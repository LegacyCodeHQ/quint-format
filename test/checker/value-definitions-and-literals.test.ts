import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("value definitions and literals", () => {
    test("reports an unindented integer value definition", () => {
      const result = checkFixture("value-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports an optional value semicolon", () => {
      const result = checkFixture("value-semicolon.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports an unindented Boolean value definition", () => {
      const result = checkFixture("boolean-value-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports an unindented string value definition", () => {
      const result = checkFixture("string-value-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical typed value formatting", () => {
      const result = checkFixture("typed-value-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical addition formatting", () => {
      const result = checkFixture("addition-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical identifier value formatting", () => {
      const result = checkFixture("identifier-value-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical unit-literal formatting", () => {
      const result = checkFixture("unit-literal.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical list-literal formatting", () => {
      const result = checkFixture("list-literal.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical tuple-literal formatting", () => {
      const result = checkFixture("tuple-literal.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical record-literal formatting", () => {
      const result = checkFixture("record-literal.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical record-spread formatting", () => {
      const result = checkFixture("record-spread.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical commented-record formatting", () => {
      const result = checkFixture("commented-record.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
