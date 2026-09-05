import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { concat, hardLine, indent, text } from "@/formatting/document.js";
import { formatPattern } from "@/formatting/pattern-formatter.js";

export function analyzeAssignmentExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type !== "assignment_expression") return undefined;

  const target = node.childForFieldName("target");
  const value = node.childForFieldName("value");
  const name = target?.childForFieldName("name");
  const equals = node.children.find((child) => child.type === "=");
  if (!target || !name || !value || !equals) {
    throw new Error("Unable to locate the assignment target or value");
  }
  const analysis = analyzeExpression(value);
  const preservesLineBreak = value.startPosition.row > equals.endPosition.row;
  return {
    document: preservesLineBreak
      ? concat([text(`${formatPattern(name)}' =`), indent(concat([hardLine, analysis.document]))])
      : concat([text(`${formatPattern(name)}' = `), analysis.document]),
    binaryOperators: analysis.binaryOperators,
    unitLiterals: analysis.unitLiterals,
    sequenceLiterals: analysis.sequenceLiterals,
    recordLiterals: analysis.recordLiterals,
    callExpressions: analysis.callExpressions,
  };
}
