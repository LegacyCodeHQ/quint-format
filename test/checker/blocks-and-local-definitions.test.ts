import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("blocks and local definitions", () => {
    test("reports an inline ordinary block", () => {
      const result = checkFixture("block-expression.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical ordinary-block comment formatting", () => {
      const result = checkFixture("block-expression-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical block-combinator formatting", () => {
      const result = checkFixture("and-block.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical block-combinator comment formatting", () => {
      const result = checkFixture("combinator-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical nondet-binding formatting", () => {
      const result = checkFixture("nondet-binding.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical nested-definition formatting", () => {
      const result = checkFixture("nested-definitions.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
