import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../diagnostics.js";
import { collectNodes } from "../../syntax.js";

export function checkUnaryExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const unaryExpression of collectNodes(root, "unary_expression")) {
    const operator = unaryExpression.childForFieldName("operator");
    const operand = unaryExpression.childForFieldName("operand");
    if (!operator || !operand) {
      throw new Error("Unable to locate the unary expression operands");
    }
    const gap = source.slice(operator.endIndex, operand.startIndex);
    if (gap !== "") {
      const row = operator.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: operator.endPosition.column + 1,
        length: Math.max(1, gap.length),
        rule: "format/unary-operator-spacing",
        message: `expected no space after '${operator.text}'`,
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
