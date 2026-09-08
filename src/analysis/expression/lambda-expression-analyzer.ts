import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { indentBy } from "@/formatting/definition-body-formatter.js";
import { concat, hardLine, indent, text } from "@/formatting/document.js";
import { lambdaBodyIndentation } from "@/formatting/lambda-body-formatter.js";
import { formatCommentedTuplePattern, formatPattern } from "@/formatting/pattern-formatter.js";
import { type CommentAttachmentIndex, isCommentNode } from "@/parsing/comment-attachments.js";
import {
  compactLambdaBlockExpression,
  hasInlineMultilineConditionalLambdaBody,
  isMultilineLambdaExpression,
} from "@/parsing/syntax.js";

export function analyzeLambdaExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
  commentAttachments: CommentAttachmentIndex,
): ExpressionAnalysis | undefined {
  if (node.type === "lambda_expression") {
    const parameters = node.childrenForFieldName("parameter");
    const body = node.childForFieldName("body");
    const openParen = node.children.find((child) => child.type === "(");
    const arrow = node.children.find((child) => child.type === "=>");
    if (parameters.length === 0 || !body || !arrow) {
      throw new Error("Unable to locate the lambda parameters or body");
    }
    const parameterDocument = openParen
      ? concat([
          text("("),
          ...parameters.flatMap((parameter, index) => [
            ...(index === 0 ? [] : [text(", ")]),
            parameter.type === "tuple_pattern" && parameter.namedChildren.some(isCommentNode)
              ? formatCommentedTuplePattern(parameter)
              : text(formatPattern(parameter)),
          ]),
          text(")"),
        ])
      : text(formatPattern(parameters[0] as Parser.SyntaxNode));
    const compactBlockExpression = compactLambdaBlockExpression(node, body, commentAttachments);
    const analysis = analyzeExpression(compactBlockExpression ?? body);
    const comments = node.namedChildren.filter(
      (child) => isCommentNode(child) && child.endIndex <= body.startIndex,
    );
    const isMultilineBody = isMultilineLambdaExpression(node);
    const preservesInlineConditionalHeader = hasInlineMultilineConditionalLambdaBody(node);
    return {
      document: compactBlockExpression
        ? concat([parameterDocument, text(" => { "), analysis.document, text(" }")])
        : comments.length === 0
          ? isMultilineBody
            ? preservesInlineConditionalHeader
              ? concat([parameterDocument, text(" => "), indent(analysis.document)])
              : concat([
                  parameterDocument,
                  text(" =>"),
                  indentBy(concat([hardLine, analysis.document]), lambdaBodyIndentation(body)),
                ])
            : concat([parameterDocument, text(" => "), analysis.document])
          : concat([
              parameterDocument,
              text(" =>"),
              indentBy(
                concat([
                  ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  analysis.document,
                ]),
                lambdaBodyIndentation(body),
              ),
            ]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  return undefined;
}
