import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
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

export function analyzeExpression(
  node: Parser.SyntaxNode,
  commentAttachments = new CommentAttachmentIndex(),
): ExpressionAnalysis {
  return analyzeExpressionWithClosingComment(node, undefined, commentAttachments);
}

function analyzeExpressionWithClosingComment(
  node: Parser.SyntaxNode,
  trailingClosingComment?: Parser.SyntaxNode,
  commentAttachments = new CommentAttachmentIndex(),
): ExpressionAnalysis {
  const analyzeChild = (child: Parser.SyntaxNode) =>
    analyzeExpressionWithClosingComment(child, undefined, commentAttachments);
  const analyzeChildWithClosingComment = (child: Parser.SyntaxNode, comment?: Parser.SyntaxNode) =>
    analyzeExpressionWithClosingComment(child, comment, commentAttachments);
  const literalAnalysis = analyzeLiteralExpression(
    node,
    trailingClosingComment,
    analyzeChild,
    analyzeChildWithClosingComment,
  );
  if (literalAnalysis) return literalAnalysis;

  const accessAnalysis = analyzeAccessExpression(node, analyzeChild);
  if (accessAnalysis) return accessAnalysis;

  const operatorAnalysis = analyzeOperatorExpression(node, analyzeChild);
  if (operatorAnalysis) return operatorAnalysis;

  const lambdaAnalysis = analyzeLambdaExpression(node, analyzeChild);
  if (lambdaAnalysis) return lambdaAnalysis;

  const conditionalAnalysis = analyzeConditionalExpression(node, analyzeChild);
  if (conditionalAnalysis) return conditionalAnalysis;

  const matchAnalysis = analyzeMatchExpression(node, analyzeChild);
  if (matchAnalysis) return matchAnalysis;

  const assignmentAnalysis = analyzeAssignmentExpression(node, analyzeChild);
  if (assignmentAnalysis) return assignmentAnalysis;

  const nestedDefinitionAnalysis = analyzeNestedDefinitionExpression(
    node,
    analyzeChild,
    commentAttachments,
  );
  if (nestedDefinitionAnalysis) return nestedDefinitionAnalysis;

  const blockAnalysis = analyzeBlockExpression(node, analyzeChild);
  if (blockAnalysis) return blockAnalysis;

  const callAnalysis = analyzeCallExpression(node, analyzeChild);
  if (callAnalysis) return callAnalysis;

  const parenthesizedAnalysis = analyzeParenthesizedExpression(node, analyzeChild);
  if (parenthesizedAnalysis) return parenthesizedAnalysis;

  throw new Error("Formatting this expression syntax is not implemented yet");
}
