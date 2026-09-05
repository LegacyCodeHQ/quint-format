import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../core/diagnostics.js";

export function checkUnitLiterals(
  unitLiterals: Parser.SyntaxNode[],
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const unitLiteral of unitLiterals) {
    const openParen = unitLiteral.children.find((child) => child.type === "(");
    const closeParen = unitLiteral.children.find((child) => child.type === ")");
    if (!openParen || !closeParen) {
      throw new Error("Unable to locate the unit literal delimiters");
    }
    const insideParentheses = source.slice(openParen.endIndex, closeParen.startIndex);
    if (insideParentheses !== "") {
      const row = openParen.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.endPosition.column + 1,
        length: Math.max(1, insideParentheses.length),
        rule: "format/expression-delimiter-spacing",
        message: "expected no space inside '()'",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
