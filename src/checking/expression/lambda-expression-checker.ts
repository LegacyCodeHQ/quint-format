import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import {
  collectNodes,
  hasInlineMultilineConditionalLambdaBody,
  isMultilineLambdaExpression,
  isMultilineUfcsContinuation,
  ufcsChainRoot,
  ufcsContinuationIndentation,
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
    const parentCall = lambda.parent?.type === "call_expression" ? lambda.parent : undefined;
    const parentFunction = parentCall?.childForFieldName("function");
    const functionObject = parentFunction?.childForFieldName("object");
    const functionDot = parentFunction?.children.find((child) => child.type === ".");
    const isMultilineUfcsLambda = Boolean(
      parentFunction?.type === "field_access_expression" &&
        functionObject &&
        functionDot &&
        functionDot.startPosition.row > functionObject.endPosition.row &&
        body.startPosition.row > arrow.endPosition.row,
    );
    const callArguments = parentCall?.childrenForFieldName("argument") ?? [];
    const argumentIndex = callArguments.findIndex((argument) => argument.id === lambda.id);
    const previousArgument = callArguments[argumentIndex - 1];
    const isInlineSecondaryArgumentInContinuedUfcsCall = Boolean(
      argumentIndex > 0 &&
        previousArgument?.endPosition.row === lambda.startPosition.row &&
        parentFunction &&
        isMultilineUfcsContinuation(parentFunction),
    );
    const expectedBodyColumn =
      isInlineSecondaryArgumentInContinuedUfcsCall && parentFunction
        ? (lines[ufcsChainRoot(parentFunction).startPosition.row]?.search(/\S|$/) ?? 0) +
          ufcsContinuationIndentation() * 2
        : (functionDot?.startPosition.column ?? 0) + 2;
    if (isMultilineUfcsLambda && functionDot && body.startPosition.column !== expectedBodyColumn) {
      const row = body.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, body.startPosition.column),
        rule: "format/lambda-body-indentation",
        message: isInlineSecondaryArgumentInContinuedUfcsCall
          ? "expected the secondary lambda body to align with the UFCS continuation"
          : "expected the lambda body two spaces inside the UFCS call",
        sourceLine: lines[row] ?? "",
      });
    }
    for (const parameter of parameters) {
      checkPatternSpacing(parameter, source, lines, filePath, diagnostics);
    }
  }

  return diagnostics;
}
