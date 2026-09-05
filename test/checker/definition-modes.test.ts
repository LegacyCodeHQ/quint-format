import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("definition modes", () => {
    test("reports noncanonical pure-definition formatting", () => {
      const result = checkFixture("pure-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical pure-value formatting", () => {
      const result = checkFixture("pure-value-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical action formatting", () => {
      const result = checkFixture("action-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical definition-body comment formatting", () => {
      const result = checkFixture("definition-body-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical run formatting", () => {
      const result = checkFixture("run-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical temporal formatting", () => {
      const result = checkFixture("temporal-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical nondet formatting", () => {
      const result = checkFixture("nondet-definition.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical empty parameter lists", () => {
      const result = checkFixture("empty-parameter-lists.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical rich definitions across every mode", () => {
      const result = checkFixture("definition-matrix.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
