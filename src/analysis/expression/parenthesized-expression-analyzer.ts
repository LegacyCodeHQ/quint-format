import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "../../analysis.js";
import { indentBy } from "../../formatting/definition-body-formatter.js";
import { concat, hardLine, text } from "../../formatting/document.js";
import { isMultilineParenthesizedPostfixReceiver } from "../../parsing/syntax.js";

export function analyzeParenthesizedExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type !== "parenthesized_expression") return undefined;

  const expression = node.childForFieldName("expression");
  if (!expression) {
    throw new Error("Unable to locate the parenthesized expression field");
  }

  const analysis = analyzeExpression(expression);
  const isBlockBodiedLambda =
    expression.type === "lambda_expression" &&
    expression.childForFieldName("body")?.type === "block_expression";
  const isBlockCombinator = [
    "all_expression",
    "any_expression",
    "and_block_expression",
    "or_block_expression",
  ].includes(expression.type);
  const isExplicitlyExpanded =
    node.startPosition.row < expression.startPosition.row ||
    expression.endPosition.row < node.endPosition.row;
  return {
    document:
      isMultilineParenthesizedPostfixReceiver(node) && !isBlockBodiedLambda && !isBlockCombinator
        ? concat([text("("), analysis.document, hardLine, text(")")])
        : isExplicitlyExpanded
          ? concat([
              text("("),
              indentBy(concat([hardLine, analysis.document]), 2),
              hardLine,
              text(")"),
            ])
          : concat([text("("), analysis.document, text(")")]),
    binaryOperators: analysis.binaryOperators,
    unitLiterals: analysis.unitLiterals,
    sequenceLiterals: analysis.sequenceLiterals,
    recordLiterals: analysis.recordLiterals,
    callExpressions: analysis.callExpressions,
  };
}
