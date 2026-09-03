import { describe, expect, test } from "bun:test";
import { concat, hardLine, indent, renderDoc, text } from "../src/document";

describe("document renderer", () => {
  test("renders indented hard lines", () => {
    const document = concat([
      text("module Example {"),
      indent(concat([hardLine, text("val answer = 42")])),
      hardLine,
      text("}"),
      hardLine,
    ]);

    expect(renderDoc(document)).toMatchSnapshot();
  });
});
