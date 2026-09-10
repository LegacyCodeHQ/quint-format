import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import { indentWidth } from "@/formatting/document.js";
import {
  matchArmBodyIndentation,
  preservesMatchArmBodyLineBreak,
} from "@/formatting/match-arm-body-formatter.js";
import { isCommentNode } from "@/parsing/comment-attachments.js";
import {
  blockCombinatorEntries,
  collectNodes,
  isBlockCombinatorExpression,
  isCompactDefaultMatch,
  isCompactMatchExpression,
} from "@/parsing/syntax.js";

export function checkMatchExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const matchExpression of collectNodes(root, "match_expression")) {
    const openBrace = matchExpression.children.find((child) => child.type === "{");
    const closeBrace = matchExpression.children.find((child) => child.type === "}");
    const arms = matchExpression.childrenForFieldName("arm");
    if (!openBrace || !closeBrace || arms.length === 0) {
      throw new Error("Unable to locate the match layout");
    }
    const rows = arms.map((arm) => arm.startPosition.row);
    const compactDefaultMatch = isCompactDefaultMatch(matchExpression);
    const compactMatch = isCompactMatchExpression(matchExpression);
    const pipes = matchExpression.children.filter((child) => child.type === "|");
    const firstArm = arms[0];
    const leadingPipe = pipes.find((pipe) => firstArm && pipe.endIndex <= firstArm.startIndex);
    const separatingPipes = pipes.filter((pipe) => pipe.id !== leadingPipe?.id);
    const hasCanonicalCompactLayout = Boolean(
      compactMatch &&
        firstArm &&
        source.slice(openBrace.endIndex, (leadingPipe ?? firstArm).startIndex) === " " &&
        (!leadingPipe || source.slice(leadingPipe.endIndex, firstArm.startIndex) === " ") &&
        separatingPipes.length === arms.length - 1 &&
        arms.slice(1).every((arm, index) => {
          const previousArm = arms[index];
          const pipe = separatingPipes[index];
          return Boolean(
            previousArm &&
              pipe &&
              source.slice(previousArm.endIndex, pipe.startIndex) === " " &&
              source.slice(pipe.endIndex, arm.startIndex) === " ",
          );
        }) &&
        source.slice(arms.at(-1)?.endIndex ?? closeBrace.startIndex, closeBrace.startIndex) === " ",
    );
    const hasCanonicalLines =
      hasCanonicalCompactLayout ||
      (rows[0] !== openBrace.startPosition.row &&
        rows.every((row, index) => index === 0 || row > (rows[index - 1] as number)) &&
        closeBrace.startPosition.row > (rows.at(-1) as number));
    if (!hasCanonicalLines) {
      const row = openBrace.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openBrace.startPosition.column + 1,
        length: 1,
        rule: "format/match-layout",
        message: compactMatch
          ? compactDefaultMatch
            ? "expected one space inside the compact default match braces"
            : "expected one space around compact match braces and arm separators"
          : "expected match arms and the closing brace on separate lines",
        sourceLine: lines[row] ?? "",
      });
    }
    for (const arm of arms) {
      const variant = arm.childForFieldName("variant");
      const parameter = arm.childForFieldName("parameter");
      const body = arm.childForFieldName("body");
      const arrow = arm.children.find((child) => child.type === "=>");
      if (!variant || !body || !arrow) throw new Error("Unable to locate a match arm");
      let patternEnd = variant;
      if (parameter) {
        const openParen = arm.children.find((child) => child.type === "(");
        const closeParen = arm.children.find((child) => child.type === ")");
        if (!openParen || !closeParen)
          throw new Error("Unable to locate the match payload pattern");
        const afterOpen = source.slice(openParen.endIndex, parameter.startIndex);
        if (afterOpen !== "") {
          const row = openParen.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: openParen.endPosition.column + 1,
            length: Math.max(1, afterOpen.length),
            rule: "format/match-pattern-spacing",
            message: "expected no space after '('",
            sourceLine: lines[row] ?? "",
          });
        }
        const beforeClose = source.slice(parameter.endIndex, closeParen.startIndex);
        if (beforeClose !== "") {
          const row = closeParen.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: parameter.endPosition.column + 1,
            length: Math.max(1, beforeClose.length),
            rule: "format/match-pattern-spacing",
            message: "expected no space before ')'",
            sourceLine: lines[row] ?? "",
          });
        }
        patternEnd = closeParen;
      }
      const preBodyComments = arm.namedChildren.filter(
        (child) => isCommentNode(child) && child.endIndex <= body.startIndex,
      );
      const inlineArrowComment = preBodyComments.find(
        (comment) => comment.startPosition.row === arrow.endPosition.row,
      );
      const afterArrow = source.slice(
        arrow.endIndex,
        inlineArrowComment?.startIndex ?? body.startIndex,
      );
      const afterInlineArrowComment = inlineArrowComment
        ? source.slice(inlineArrowComment.endIndex, body.startIndex)
        : "";
      const hasCanonicalBodySeparation = inlineArrowComment
        ? /^[\t ]+$/.test(afterArrow) && /^(?:\r\n|\r|\n)[\t ]*$/.test(afterInlineArrowComment)
        : afterArrow === " " || /^(?:\r\n|\r|\n)[\t ]*$/.test(afterArrow);
      if (
        !/^ +$/u.test(source.slice(patternEnd.endIndex, arrow.startIndex)) ||
        !hasCanonicalBodySeparation
      ) {
        const row = arrow.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: arrow.startPosition.column + 1,
          length: 2,
          rule: "format/match-arrow-spacing",
          message: "expected one space around '=>'",
          sourceLine: lines[row] ?? "",
        });
      }

      const structuralEntries = isBlockCombinatorExpression(body)
        ? blockCombinatorEntries(body)
        : body.type === "match_expression"
          ? body.childrenForFieldName("arm")
          : body.type === "record_literal"
            ? body.namedChildren.filter(
                (child) => child.type === "record_literal_field" || child.type === "record_spread",
              )
            : body.type === "block_expression"
              ? [
                  ...body.childrenForFieldName("binding"),
                  body.childForFieldName("expression"),
                ].filter((entry): entry is Parser.SyntaxNode => entry !== null)
              : undefined;
      const indentationColumn = (candidate: Parser.SyntaxNode) =>
        lines[candidate.startPosition.row]?.search(/\S|$/u) ?? candidate.startPosition.column;
      const armColumn = indentationColumn(arm);
      const lineBrokenBody = preservesMatchArmBodyLineBreak(patternEnd, arrow, body);
      const bodyIndentationLevels = matchArmBodyIndentation(body);
      const expectedLineBrokenBodyColumn = armColumn + bodyIndentationLevels * indentWidth;
      if (lineBrokenBody && indentationColumn(body) !== expectedLineBrokenBodyColumn) {
        const row = body.startPosition.row;
        const actualBodyColumn = indentationColumn(body);
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, actualBodyColumn),
          rule: "format/match-arm-body-indentation",
          message:
            bodyIndentationLevels === 1
              ? "expected one indentation level for the line-broken match arm body"
              : "expected a four-space continuation indent for the line-broken match arm body",
          sourceLine: lines[row] ?? "",
        });
      }
      if (structuralEntries) {
        const closeBrace = body.children.find((child) => child.type === "}");
        const bodyColumn = armColumn + (lineBrokenBody ? bodyIndentationLevels : 1) * indentWidth;
        const expectedEntryColumn = bodyColumn + indentWidth;
        const expectedCloseColumn = bodyColumn;
        const misindentedEntry = structuralEntries.find(
          (entry) => indentationColumn(entry) !== expectedEntryColumn,
        );
        const misindentedNode =
          misindentedEntry ??
          (closeBrace?.startPosition.column !== expectedCloseColumn ? closeBrace : undefined);
        if (misindentedNode) {
          const row = misindentedNode.startPosition.row;
          const nodeColumn = indentationColumn(misindentedNode);
          diagnostics.push({
            filePath,
            line: row + 1,
            column: 1,
            length: Math.max(1, nodeColumn),
            rule: "format/match-arm-body-indentation",
            message:
              body.type === "block_expression"
                ? "expected block body aligned with the match case"
                : "expected one structural indentation level inside the match arm",
            sourceLine: lines[row] ?? "",
          });
        }
      }
    }
  }

  return diagnostics;
}
