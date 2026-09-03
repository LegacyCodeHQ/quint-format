import { describe, expect, test } from "bun:test";
import { concat, group, hardLine, indent, line, renderDoc, text } from "../src/document";

function groupedModule() {
  return concat([
    group(
      concat([
        text("module Example {"),
        indent(concat([line, text("val answer = 42")])),
        line,
        text("}"),
      ]),
    ),
    hardLine,
  ]);
}

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

  test("keeps groups on one line when they fit", () => {
    expect(renderDoc(groupedModule())).toMatchSnapshot();
  });

  test("breaks groups when they exceed the line width", () => {
    expect(renderDoc(groupedModule(), { lineWidth: 20 })).toMatchSnapshot();
  });
});
