import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../diagnostics.js";
import { isMultilineLambdaExpression, isMultilineUfcsContinuation } from "../../parsing/syntax.js";

export function checkCallExpressions(
  callExpressions: Parser.SyntaxNode[],
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const callExpression of callExpressions) {
    const functionNode = callExpression.childForFieldName("function");
    const openParen = callExpression.children.find((child) => child.type === "(");
    const closeParen = callExpression.children.find((child) => child.type === ")");
    const arguments_ = callExpression.childrenForFieldName("argument");
    const commas = callExpression.children.filter((child) => child.type === ",");
    const isMultilineLambdaCall =
      arguments_.length === 1 && isMultilineLambdaExpression(arguments_[0] as Parser.SyntaxNode);
    if (!functionNode || !openParen || !closeParen) {
      throw new Error("Unable to locate the call delimiters");
    }
    if (
      callExpression.namedChildren.some(
        (child) => child.type === "comment" || child.type === "documentation_comment",
      )
    ) {
      continue;
    }
    const first = arguments_[0];
    const last = arguments_.at(-1);
    if (first && last) {
      const penultimate = arguments_.at(-2);
      const isHangingMultilineLambdaCall =
        arguments_.length > 1 &&
        isMultilineLambdaExpression(last) &&
        Boolean(penultimate && last.startPosition.row > penultimate.endPosition.row) &&
        arguments_.slice(0, -1).every((argument, index) => {
          const previous = index === 0 ? openParen : arguments_[index - 1];
          return argument.startPosition.row === previous.endPosition.row;
        }) &&
        closeParen.startPosition.row > last.endPosition.row;
      const functionDot =
        functionNode.type === "field_access_expression"
          ? functionNode.children.find((child) => child.type === ".")
          : undefined;
      const callIndentation =
        functionDot?.startPosition.column ?? callExpression.startPosition.column;
      const isMultilineUfcsCall = Boolean(functionDot && isMultilineUfcsContinuation(functionNode));
      const hangingArgumentGap = `\n${" ".repeat(callIndentation + 2)}`;
      const hangingCloseGap = `\n${" ".repeat(callIndentation)}`;
      const expressionLineIndentation = (lines[callExpression.startPosition.row] ?? "").search(
        /\S|$/,
      );
      const expandedArgumentColumn = expressionLineIndentation + 4;
      const isVerticallyExpandedCall =
        first.startPosition.row > openParen.endPosition.row &&
        closeParen.startPosition.row > last.endPosition.row;
      const hasSourceArgumentBreak = arguments_.some((argument, index) => {
        const previous = index === 0 ? openParen : arguments_[index - 1];
        return argument.startPosition.row > previous.endPosition.row;
      });
      const isPartiallyExpandedCallWithClosingBreak =
        first.startPosition.row === openParen.endPosition.row &&
        hasSourceArgumentBreak &&
        closeParen.startPosition.row > last.endPosition.row;
      const expandedArgumentGap = `\n${" ".repeat(expandedArgumentColumn)}`;
      const expandedCloseGap = `\n${" ".repeat(expressionLineIndentation)}`;
      const requiresTrailingComma =
        functionNode.type !== "field_access_expression" &&
        closeParen.startPosition.row > last.endPosition.row;
      const afterOpen = source.slice(openParen.endIndex, first.startIndex);
      if (afterOpen !== (isVerticallyExpandedCall ? expandedArgumentGap : "")) {
        const row = openParen.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openParen.endPosition.column + 1,
          length: Math.max(1, afterOpen.length),
          rule: "format/call-delimiter-spacing",
          message: "expected no space after '('",
          sourceLine: lines[row] ?? "",
        });
      }
      for (const [index, comma] of commas.entries()) {
        const previous = arguments_[index];
        const next = arguments_[index + 1];
        if (!previous || !next) {
          if (requiresTrailingComma) continue;
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/unnecessary-trailing-comma",
            message: "trailing commas are omitted from inline calls",
            sourceLine: lines[row] ?? "",
          });
          continue;
        }
        const nextStartsOnNewLine = next.startPosition.row > previous.endPosition.row;
        const expectedNextGap =
          isHangingMultilineLambdaCall && next.id === last.id
            ? hangingArgumentGap
            : (isVerticallyExpandedCall || isPartiallyExpandedCallWithClosingBreak) &&
                nextStartsOnNewLine
              ? expandedArgumentGap
              : " ";
        if (
          source.slice(previous.endIndex, comma.startIndex) !== "" ||
          source.slice(comma.endIndex, next.startIndex) !== expectedNextGap
        ) {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/argument-separator-spacing",
            message:
              expectedNextGap === " "
                ? "expected ', ' between arguments"
                : "expected a line break and continuation indentation after ','",
            sourceLine: lines[row] ?? "",
          });
        }
      }
      const trailingComma = commas.find((comma) => comma.startIndex >= last.endIndex);
      if (requiresTrailingComma && !trailingComma) {
        const row = last.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: last.endPosition.column + 1,
          length: 1,
          rule: "format/missing-trailing-comma",
          message: "expected a trailing comma in a multiline call",
          sourceLine: lines[row] ?? "",
        });
      }
      const anchor = trailingComma ?? last;
      const beforeClose = source.slice(anchor.endIndex, closeParen.startIndex);
      const hasCanonicalClose = isVerticallyExpandedCall
        ? beforeClose === expandedCloseGap
        : isPartiallyExpandedCallWithClosingBreak
          ? beforeClose === expandedCloseGap
          : isHangingMultilineLambdaCall
            ? beforeClose === hangingCloseGap
            : isMultilineLambdaCall
              ? isMultilineUfcsCall
                ? beforeClose === hangingCloseGap
                : /^(?:\r\n|\r|\n)[\t ]*$/.test(beforeClose)
              : beforeClose === "";
      if (!hasCanonicalClose) {
        const row = closeParen.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: anchor.endPosition.column + 1,
          length: Math.max(1, beforeClose.length),
          rule: "format/call-delimiter-spacing",
          message: "expected no space before ')'",
          sourceLine: lines[row] ?? "",
        });
      }
      if (isVerticallyExpandedCall || isPartiallyExpandedCallWithClosingBreak) {
        for (const [index, argument] of arguments_.entries()) {
          const previous = index === 0 ? openParen : arguments_[index - 1];
          if (
            previous &&
            argument.startPosition.row > previous.endPosition.row &&
            argument.startPosition.column !== expandedArgumentColumn
          ) {
            const row = argument.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: 1,
              length: Math.max(1, argument.startPosition.column),
              rule: "format/call-argument-indentation",
              message: "expected a four-space continuation indent",
              sourceLine: lines[row] ?? "",
            });
          }
        }
      }
    } else {
      const inside = source.slice(openParen.endIndex, closeParen.startIndex);
      if (inside !== "") {
        const row = openParen.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openParen.endPosition.column + 1,
          length: Math.max(1, inside.length),
          rule: "format/call-delimiter-spacing",
          message: "expected no space inside '()'",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }

  return diagnostics;
}
