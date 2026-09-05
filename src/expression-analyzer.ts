import type Parser from "tree-sitter";
import { analyzeAccessExpression } from "./access-expression-analyzer.js";
import type { ExpressionAnalysis } from "./analysis.js";
import { analyzeAssignmentExpression } from "./assignment-expression-analyzer.js";
import { analyzeBlockExpression } from "./block-expression-analyzer.js";
import { analyzeCallExpression } from "./call-expression-analyzer.js";
import { analyzeConditionalExpression } from "./conditional-expression-analyzer.js";
import { indentBy } from "./definition-body-formatter.js";
import { concat, hardLine, text } from "./document.js";
import { analyzeLambdaExpression } from "./lambda-expression-analyzer.js";
import { analyzeLiteralExpression } from "./literal-expression-analyzer.js";
import { analyzeMatchExpression } from "./match-expression-analyzer.js";
import { analyzeNestedDefinitionExpression } from "./nested-definition-expression-analyzer.js";
import { analyzeOperatorExpression } from "./operator-expression-analyzer.js";
import { isMultilineParenthesizedPostfixReceiver } from "./syntax.js";

export function analyzeExpression(node: Parser.SyntaxNode): ExpressionAnalysis {
  return analyzeExpressionWithClosingComment(node);
}

function analyzeExpressionWithClosingComment(
  node: Parser.SyntaxNode,
  trailingClosingComment?: Parser.SyntaxNode,
): ExpressionAnalysis {
  const literalAnalysis = analyzeLiteralExpression(
    node,
    trailingClosingComment,
    analyzeExpression,
    analyzeExpressionWithClosingComment,
  );
  if (literalAnalysis) return literalAnalysis;

  const accessAnalysis = analyzeAccessExpression(node, analyzeExpression);
  if (accessAnalysis) return accessAnalysis;

  const operatorAnalysis = analyzeOperatorExpression(node, analyzeExpression);
  if (operatorAnalysis) return operatorAnalysis;

  const lambdaAnalysis = analyzeLambdaExpression(node, analyzeExpression);
  if (lambdaAnalysis) return lambdaAnalysis;

  const conditionalAnalysis = analyzeConditionalExpression(node, analyzeExpression);
  if (conditionalAnalysis) return conditionalAnalysis;

  const matchAnalysis = analyzeMatchExpression(node, analyzeExpression);
  if (matchAnalysis) return matchAnalysis;

  const assignmentAnalysis = analyzeAssignmentExpression(node, analyzeExpression);
  if (assignmentAnalysis) return assignmentAnalysis;

  const nestedDefinitionAnalysis = analyzeNestedDefinitionExpression(node, analyzeExpression);
  if (nestedDefinitionAnalysis) return nestedDefinitionAnalysis;

  const blockAnalysis = analyzeBlockExpression(node, analyzeExpression);
  if (blockAnalysis) return blockAnalysis;

  const callAnalysis = analyzeCallExpression(node, analyzeExpression);
  if (callAnalysis) return callAnalysis;

  if (node.type === "parenthesized_expression") {
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

  throw new Error("Formatting this expression syntax is not implemented yet");
}
