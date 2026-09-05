import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { indentBy } from "@/formatting/definition-body-formatter.js";
import { concat, hardLine, indent, renderDoc, text } from "@/formatting/document.js";
import { formatCommentedTuplePattern, formatPattern } from "@/formatting/pattern-formatter.js";
import { compactLambdaBlockExpression, isMultilineLambdaExpression } from "@/parsing/syntax.js";

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
    const sourceContinuationIndentation =
      body.startPosition.row > arrow.endPosition.row &&
      body.startPosition.column - continuationAnchor.startPosition.column >= 4
        ? 2
        : 1;
    const enclosingCall = node.parent?.type === "call_expression" ? node.parent : undefined;
    const callArguments = enclosingCall?.childrenForFieldName("argument") ?? [];
    const argumentIndex = callArguments.findIndex((argument) => argument.id === node.id);
    const previousArgument = callArguments[argumentIndex - 1];
    const isInlineSecondaryArgument = Boolean(
      previousArgument && previousArgument.endPosition.row === node.startPosition.row,
    );
    const preservedBodyExceedsLineWidth = renderDoc(
      indentBy(concat([hardLine, analysis.document]), sourceContinuationIndentation),
    )
      .split("\n")
      .some((line) => line.length > 120);
    const continuationIndentation =
      isInlineSecondaryArgument && preservedBodyExceedsLineWidth
        ? 1
        : sourceContinuationIndentation;
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
