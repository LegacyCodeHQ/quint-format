import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import { lambdaBodyColumn, lambdaBodyIndentation } from "@/formatting/lambda-body-formatter.js";
import { isCommentNode } from "@/parsing/comment-attachments.js";
import {
  collectNodes,
  hasInlineMultilineConditionalLambdaBody,
  isMultilineLambdaExpression,
} from "@/parsing/syntax.js";
import { checkPatternSpacing } from "./pattern-checker.js";

export function checkLambdaExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const lambda of collectNodes(root, "lambda_expression")) {
    const parameters = lambda.childrenForFieldName("parameter");
    const body = lambda.childForFieldName("body");
    const arrow = lambda.children.find((child) => child.type === "=>");
    const openParen = lambda.children.find((child) => child.type === "(");
    const closeParen = lambda.children.find((child) => child.type === ")");
    const first = parameters[0];
    const last = parameters.at(-1);
    if (!body || !arrow || !first || !last) {
      throw new Error("Unable to locate the lambda syntax");
    }
    if (openParen && closeParen) {
      const afterOpen = source.slice(openParen.endIndex, first.startIndex);
      if (afterOpen !== "") {
        const row = openParen.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openParen.endPosition.column + 1,
          length: Math.max(1, afterOpen.length),
          rule: "format/lambda-parameter-list-spacing",
          message: "expected no space after '('",
          sourceLine: lines[row] ?? "",
        });
      }
      const commas = lambda.children.filter((child) => child.type === ",");
      for (const [index, comma] of commas.entries()) {
        const previous = parameters[index];
        const next = parameters[index + 1];
        if (
          previous &&
          next &&
          (source.slice(previous.endIndex, comma.startIndex) !== "" ||
            source.slice(comma.endIndex, next.startIndex) !== " ")
        ) {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/lambda-parameter-separator-spacing",
            message: "expected ', ' between parameters",
            sourceLine: lines[row] ?? "",
          });
        }
      }
      const beforeClose = source.slice(last.endIndex, closeParen.startIndex);
      if (beforeClose !== "") {
        const row = closeParen.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: last.endPosition.column + 1,
          length: Math.max(1, beforeClose.length),
          rule: "format/lambda-parameter-list-spacing",
          message: "expected no space before ')'",
          sourceLine: lines[row] ?? "",
        });
      }
    }
    const arrowAnchor = closeParen ?? last;
    const afterArrow = source.slice(arrow.endIndex, body.startIndex);
    const hasCanonicalBodySeparation = hasInlineMultilineConditionalLambdaBody(lambda)
      ? afterArrow === " "
      : isMultilineLambdaExpression(lambda)
        ? /^(?:\r\n|\r|\n)[\t ]*$/.test(afterArrow)
        : afterArrow === " ";
    if (
      source.slice(arrowAnchor.endIndex, arrow.startIndex) !== " " ||
      !hasCanonicalBodySeparation
    ) {
      const row = arrow.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: arrow.startPosition.column + 1,
        length: 2,
        rule: "format/lambda-arrow-spacing",
        message: "expected one space around '=>'",
        sourceLine: lines[row] ?? "",
      });
    }
    const leadingComments = lambda.namedChildren.filter(
      (child) =>
        isCommentNode(child) &&
        child.startIndex >= arrow.endIndex &&
        child.endIndex <= body.startIndex,
    );
    const firstContinuationNode = leadingComments[0] ?? body;
    const hasLineBrokenBody = firstContinuationNode.startPosition.row > arrow.endPosition.row;
    const bodyIndentation = lambdaBodyIndentation(body);
    const expectedBodyColumn = lambdaBodyColumn(lambda, body);
    if (
      hasLineBrokenBody &&
      (firstContinuationNode.startPosition.column !== expectedBodyColumn ||
        body.startPosition.column !== expectedBodyColumn)
    ) {
      const row = firstContinuationNode.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, firstContinuationNode.startPosition.column),
        rule: "format/lambda-body-indentation",
        message:
          bodyIndentation === 2
            ? "expected a four-space continuation indent after '=>'"
            : "expected a two-space structural indent after '=>'",
        sourceLine: lines[row] ?? "",
      });
    }
    for (const parameter of parameters) {
      checkPatternSpacing(parameter, source, lines, filePath, diagnostics);
    }
  }

  return diagnostics;
}
