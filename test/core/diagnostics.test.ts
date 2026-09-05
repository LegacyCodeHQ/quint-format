import { describe, expect, test } from "bun:test";
import { checkQuint, formatQuint, QuintSyntaxError, renderDiagnostic } from "@/index.js";

describe("diagnostic hardening", () => {
  test("reports Unicode-aware source columns", () => {
    const source = 'module Example {\n  val label = "🙂"+ "x"\n}\n';
    const diagnostic = checkQuint(source, "unicode.qnt").find(
      ({ rule }) => rule === "format/binary-operator-spacing",
    );

    expect(diagnostic).toBeDefined();
    if (!diagnostic) throw new Error("Expected a binary-operator diagnostic");
    expect(diagnostic).toMatchSnapshot();
    expect(renderDiagnostic(diagnostic)).toMatchSnapshot();
  });

  test("aligns source frames containing tabs", () => {
    const source = "module Example {\n\tval answer=42\n}\n";
    const diagnostic = checkQuint(source, "tab.qnt").find(
      ({ rule }) => rule === "format/equals-spacing",
    );

    expect(diagnostic).toBeDefined();
    if (!diagnostic) throw new Error("Expected an equals-spacing diagnostic");
    const rendered = renderDiagnostic(diagnostic);
    expect(rendered).toContain("2 |   val answer=42");
    expect(rendered).toMatchSnapshot();
  });

  test("normalizes CRLF input deterministically", () => {
    const source = "module Example {\n  val answer = 42\n}\n".replaceAll("\n", "\r\n");
    const output = formatQuint(source);

    expect(output).not.toContain("\r");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("anchors multiline syntax failures to the failing range", () => {
    const source = "module Example {\n  val value = (\n    1 +\n  )\n}\n";

    try {
      checkQuint(source, "multiline.qnt");
      throw new Error("Expected invalid multiline Quint syntax");
    } catch (error) {
      expect(error).toBeInstanceOf(QuintSyntaxError);
      const syntaxError = error as QuintSyntaxError;
      expect(syntaxError.diagnostics).toMatchSnapshot();
      expect(
        syntaxError.diagnostics
          .map((diagnostic) => renderDiagnostic({ filePath: "multiline.qnt", ...diagnostic }))
          .join(""),
      ).toMatchSnapshot();
    }
  });
});
