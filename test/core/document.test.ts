import { describe, expect, test } from "bun:test";
import {
  concat,
  group,
  hardLine,
  indent,
  indentWidth,
  line,
  renderDoc,
  text,
} from "@/formatting/document.js";
import {
  continuationIndentLevels,
  defaultFormatPolicy,
  maxPreservedLineBreaks,
} from "@/formatting/policy.js";

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

  test("uses a 120-column default line width", () => {
    const left = "x".repeat(60);
    const right = "y".repeat(50);
    const output = renderDoc(group(concat([text(left), line, text(right)])));

    expect(output).toBe(`${left} ${right}`);
    expect(output).toMatchSnapshot();
  });

  test("keeps derived formatting dimensions consistent with the shared policy", () => {
    expect(indentWidth).toBe(defaultFormatPolicy.indentWidth);
    expect(continuationIndentLevels * indentWidth).toBe(
      defaultFormatPolicy.continuationIndentWidth,
    );
    expect(maxPreservedLineBreaks).toBe(defaultFormatPolicy.maxPreservedBlankLines + 1);
  });
});
