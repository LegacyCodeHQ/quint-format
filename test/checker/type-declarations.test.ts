import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

function expectFormattingViolation(fixture: string) {
  const result = checkFixture(fixture);

  expect(result.kind).toBe("format");
  expect(result.rendered).toMatchSnapshot();
}

describe("checker diagnostics", () => {
  describe("type declarations", () => {
    test("reports noncanonical type-alias formatting", () => {
      expectFormattingViolation("type-alias.qnt");
    });

    test("reports noncanonical uninterpreted-type formatting", () => {
      expectFormattingViolation("uninterpreted-type.qnt");
    });

    test("reports noncanonical named-type-alias formatting", () => {
      expectFormattingViolation("named-type-alias.qnt");
    });

    test("reports noncanonical polymorphic-type-alias formatting", () => {
      expectFormattingViolation("polymorphic-type-alias.qnt");
    });

    test("reports noncanonical type-application formatting", () => {
      expectFormattingViolation("type-application.qnt");
    });

    test("reports noncanonical sum-type formatting", () => {
      expectFormattingViolation("sum-type.qnt");
    });

    test("reports noncanonical multiline-sum-type formatting", () => {
      expectFormattingViolation("multiline-sum-type.qnt");
    });

    test("reports noncanonical sum-type comment formatting", () => {
      expectFormattingViolation("sum-type-comment.qnt");
    });
  });
});
