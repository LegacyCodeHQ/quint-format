import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../diagnostics.js";
import { collectNodes } from "../../syntax.js";

export function checkAssignments(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const assignment of collectNodes(root, "assignment_expression")) {
    const target = assignment.childForFieldName("target");
    const value = assignment.childForFieldName("value");
    const name = target?.childForFieldName("name");
    const prime = target?.children.find((child) => child.type === "'");
    const equals = assignment.children.find((child) => child.type === "=");
    if (!target || !value || !name || !prime || !equals) {
      throw new Error("Unable to locate the primed assignment syntax");
    }
    const primeGap = source.slice(name.endIndex, prime.startIndex);
    if (primeGap !== "") {
      const row = name.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: name.endPosition.column + 1,
        length: Math.max(1, primeGap.length),
        rule: "format/prime-spacing",
        message: 'expected no space before "\'"',
        sourceLine: lines[row] ?? "",
      });
    }
    const preservesLineBreak = value.startPosition.row > equals.endPosition.row;
    const expectedValueGap = preservesLineBreak
      ? `\n${" ".repeat(assignment.startPosition.column + 2)}`
      : " ";
    if (
      source.slice(target.endIndex, equals.startIndex) !== " " ||
      source.slice(equals.endIndex, value.startIndex) !== expectedValueGap
    ) {
      const row = equals.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: equals.startPosition.column + 1,
        length: 1,
        rule: "format/assignment-spacing",
        message: preservesLineBreak
          ? "expected a line break and two-space indentation after '='"
          : "expected one space around '='",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
