import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../diagnostics.js";
import { collectNodes } from "../../parsing/syntax.js";

export function checkIndexExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const indexExpression of collectNodes(root, "index_expression")) {
    const openBracket = indexExpression.children.find((child) => child.type === "[");
    const closeBracket = indexExpression.children.find((child) => child.type === "]");
    const index = indexExpression.childForFieldName("index");
    if (!openBracket || !closeBracket || !index) {
      throw new Error("Unable to locate the index expression delimiters");
    }
    const afterOpen = source.slice(openBracket.endIndex, index.startIndex);
    if (afterOpen !== "") {
      const row = openBracket.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openBracket.endPosition.column + 1,
        length: Math.max(1, afterOpen.length),
        rule: "format/index-delimiter-spacing",
        message: "expected no space after '['",
        sourceLine: lines[row] ?? "",
      });
    }
    const beforeClose = source.slice(index.endIndex, closeBracket.startIndex);
    if (beforeClose !== "") {
      const row = closeBracket.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: index.endPosition.column + 1,
        length: Math.max(1, beforeClose.length),
        rule: "format/index-delimiter-spacing",
        message: "expected no space before ']'",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  return diagnostics;
}
