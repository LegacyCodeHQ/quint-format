import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "../../analysis.js";
import { commentDocument } from "../../comments.js";
import { indentBy } from "../../definition-body-formatter.js";
import { concat, hardLine, indent, text } from "../../document.js";
import { formatCommentedTuplePattern, formatPattern } from "../../pattern-formatter.js";
import { compactLambdaBlockExpression, isMultilineLambdaExpression } from "../../syntax.js";

export function analyzeLambdaExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
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
            parameter.type === "tuple_pattern" &&
            parameter.namedChildren.some(
              (child) => child.type === "comment" || child.type === "documentation_comment",
            )
              ? formatCommentedTuplePattern(parameter)
              : text(formatPattern(parameter)),
          ]),
          text(")"),
        ])
      : text(formatPattern(parameters[0] as Parser.SyntaxNode));
    const compactBlockExpression = compactLambdaBlockExpression(node, body);
    const analysis = analyzeExpression(compactBlockExpression ?? body);
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.endIndex <= body.startIndex,
    );
    const isMultilineBody = isMultilineLambdaExpression(node);
    let continuationAnchor = node;
    let ancestor = node.parent;
    while (ancestor) {
      if (
        ancestor.startPosition.row === node.startPosition.row &&
        ancestor.startPosition.column < continuationAnchor.startPosition.column &&
        ancestor.type !== "module_definition" &&
        ancestor.type !== "source_file"
      ) {
        continuationAnchor = ancestor;
      }
      ancestor = ancestor.parent;
    }
    const continuationIndentation =
      body.startPosition.row > arrow.endPosition.row &&
      body.startPosition.column - continuationAnchor.startPosition.column >= 4
        ? 2
        : 1;
    return {
      document: compactBlockExpression
        ? concat([parameterDocument, text(" => { "), analysis.document, text(" }")])
        : comments.length === 0
          ? isMultilineBody
            ? concat([
                parameterDocument,
                text(" =>"),
                indentBy(concat([hardLine, analysis.document]), continuationIndentation),
              ])
            : concat([parameterDocument, text(" => "), analysis.document])
          : concat([
              parameterDocument,
              text(" =>"),
              indent(
                concat([
                  ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  analysis.document,
                ]),
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
