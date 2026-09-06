import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import {
  collectNodes,
  isBraceDelimitedExpression,
  isMultilineParenthesizedPostfixReceiver,
} from "@/parsing/syntax.js";

export function checkParenthesizedExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const parenthesized of collectNodes(root, "parenthesized_expression")) {
    const expression = parenthesized.childForFieldName("expression");
    const closeParenthesis = parenthesized.children.find((child) => child.type === ")");
    if (
      !expression ||
      !closeParenthesis ||
      !isMultilineParenthesizedPostfixReceiver(parenthesized) ||
      !isBraceDelimitedExpression(expression) ||
      source.slice(expression.endIndex, closeParenthesis.startIndex) === ""
    ) {
      continue;
    }

    const row = closeParenthesis.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: closeParenthesis.startPosition.column + 1,
      length: 1,
      rule: "format/parenthesized-postfix-delimiter",
      message: "expected ')' immediately after the closing brace",
      sourceLine: lines[row] ?? "",
    });
  }

  return diagnostics;
}
