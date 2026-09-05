import { describe, expect, test } from "bun:test";
import { checkFixture } from "../support/check";

describe("checker diagnostics", () => {
  describe("comments and comment layout", () => {
    test("reports noncanonical leading line-comment formatting", () => {
      const result = checkFixture("leading-line-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical documentation-comment formatting", () => {
      const result = checkFixture("documentation-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical block-comment formatting", () => {
      const result = checkFixture("block-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical multiline block-comment formatting", () => {
      const result = checkFixture("multiline-block-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical module documentation-comment formatting", () => {
      const result = checkFixture("module-documentation-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical trailing line-comment formatting", () => {
      const result = checkFixture("trailing-line-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports a misindented trailing module-body comment", () => {
      const result = checkFixture("trailing-module-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical trailing source comments", () => {
      const result = checkFixture("trailing-source-comments.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports a misindented comment-only module", () => {
      const result = checkFixture("comment-only-module.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical inline-comment formatting", () => {
      const result = checkFixture("inline-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical binary-right comment formatting", () => {
      const result = checkFixture("binary-right-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical nested-definition comment formatting", () => {
      const result = checkFixture("nested-definition-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical local trailing-comment formatting", () => {
      const result = checkFixture("local-definition-trailing-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });

    test("reports noncanonical local definition-body comment formatting", () => {
      const result = checkFixture("local-definition-body-comment.qnt");

      expect(result.kind).toBe("format");
      expect(result.rendered).toMatchSnapshot();
    });
  });
});
