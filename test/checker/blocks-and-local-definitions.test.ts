import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("blocks and local definitions", () => {
    test("reports noncanonical compact ordinary-block spacing", () => {
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

    test("accepts an attached comment block after a multiline local definition", () => {
      const result = checkFixture("multiline-local-comment-gap.qnt");

      expect(result.kind).toBe("clean");
      expect(result.diagnostics).toEqual([]);
    });

    test("accepts an adjacent result after a multiline local definition", () => {
      const result = checkFixture("multiline-local-result-gap.qnt");

      expect(result.kind).toBe("clean");
      expect(result.diagnostics).toEqual([]);
    });
  });
});
