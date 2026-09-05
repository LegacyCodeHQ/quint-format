import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../diagnostics.js";
import { collectNodes } from "../../parsing/syntax.js";

export function checkNondetBindings(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const binding of collectNodes(root, "nondet_binding")) {
    const keyword = binding.children.find((child) => child.type === "nondet");
    const name = binding.childForFieldName("name");
    const equals = binding.children.find((child) => child.type === "=");
    const value = binding.childForFieldName("value");
    if (!keyword || !name || !equals || !value) {
      throw new Error("Unable to locate the nondet binding syntax");
    }
    const afterKeyword = source.slice(keyword.endIndex, name.startIndex);
    if (afterKeyword !== " ") {
      const row = keyword.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: keyword.endPosition.column + 1,
        length: Math.max(1, afterKeyword.length),
        rule: "format/nondet-binding-spacing",
        message: "expected one space after 'nondet'",
        sourceLine: lines[row] ?? "",
      });
    }
    if (
      source.slice(name.endIndex, equals.startIndex) !== " " ||
      source.slice(equals.endIndex, value.startIndex) !== " "
    ) {
      const row = equals.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: equals.startPosition.column + 1,
        length: 1,
        rule: "format/nondet-binding-spacing",
        message: "expected one space around '='",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
