import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "../../analysis.js";
import { analyzeAccessExpression } from "./access-expression-analyzer.js";
import { analyzeAssignmentExpression } from "./assignment-expression-analyzer.js";
import { analyzeBlockExpression } from "./block-expression-analyzer.js";
import { analyzeCallExpression } from "./call-expression-analyzer.js";
import { analyzeConditionalExpression } from "./conditional-expression-analyzer.js";
import { analyzeLambdaExpression } from "./lambda-expression-analyzer.js";
import { analyzeLiteralExpression } from "./literal-expression-analyzer.js";
import { analyzeMatchExpression } from "./match-expression-analyzer.js";
import { analyzeNestedDefinitionExpression } from "./nested-definition-expression-analyzer.js";
import { analyzeOperatorExpression } from "./operator-expression-analyzer.js";
import { analyzeParenthesizedExpression } from "./parenthesized-expression-analyzer.js";

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

  const parenthesizedAnalysis = analyzeParenthesizedExpression(node, analyzeExpression);
  if (parenthesizedAnalysis) return parenthesizedAnalysis;

  throw new Error("Formatting this expression syntax is not implemented yet");
}
