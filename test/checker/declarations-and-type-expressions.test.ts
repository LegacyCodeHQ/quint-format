import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

function expectFormattingViolation(fixture: string) {
  const result = checkFixture(fixture);

  expect(result.kind).toBe("format");
  expect(result.rendered).toMatchSnapshot();
}

describe("checker diagnostics", () => {
  describe("declarations and type expressions", () => {
    test("reports an unindented module declaration", () => {
      expectFormattingViolation("variable-indentation.qnt");
    });

    test("reports missing spacing after a type colon", () => {
      expectFormattingViolation("type-colon-spacing.qnt");
    });

    test("reports whitespace before a type colon", () => {
      expectFormattingViolation("before-type-colon.qnt");
    });

    test("reports noncanonical spacing after var", () => {
      expectFormattingViolation("variable-keyword-spacing.qnt");
    });

    test("reports an unindented constant declaration", () => {
      expectFormattingViolation("constant-declaration.qnt");
    });

    test("reports noncanonical Set-type formatting", () => {
      expectFormattingViolation("set-type.qnt");
    });

    test("reports noncanonical tuple-type formatting", () => {
      expectFormattingViolation("tuple-type.qnt");
    });

    test("reports noncanonical record-type formatting", () => {
      expectFormattingViolation("record-type.qnt");
    });

    test("reports a missing multiline record-type trailing comma", () => {
      expectFormattingViolation("multiline-record-type-missing-comma.qnt");
    });

    test("reports noncanonical commented-record-type formatting", () => {
      expectFormattingViolation("record-type-comment.qnt");
    });

    test("reports noncanonical empty-record-type formatting", () => {
      expectFormattingViolation("empty-record-type.qnt");
    });

    test("reports noncanonical open-record-type formatting", () => {
      expectFormattingViolation("open-record-type.qnt");
    });

    test("reports noncanonical function-type formatting", () => {
      expectFormattingViolation("function-type.qnt");
    });

    test("reports noncanonical operator-type formatting", () => {
      expectFormattingViolation("operator-type.qnt");
    });

    test("reports noncanonical zero-parameter-operator-type formatting", () => {
      expectFormattingViolation("zero-parameter-operator-type.qnt");
    });

    test("reports noncanonical direct-operator-type formatting", () => {
      expectFormattingViolation("direct-operator-type.qnt");
    });

    test("reports noncanonical parenthesized-type formatting", () => {
      expectFormattingViolation("parenthesized-type.qnt");
    });

    test("reports noncanonical unit-type formatting", () => {
      expectFormattingViolation("unit-type.qnt");
    });

    test("reports adjacent declarations on the same line", () => {
      expectFormattingViolation("declaration-line-break.qnt");
    });
  });
});
