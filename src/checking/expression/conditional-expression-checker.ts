import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import {
  collectNodes,
  hasInlineMultilineConditionalLambdaBody,
  isElseIfBranch,
} from "@/parsing/syntax.js";

export function checkConditionalExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const conditional of collectNodes(root, "if_expression")) {
    const keyword = conditional.children.find((child) => child.type === "if");
    const openParen = conditional.children.find((child) => child.type === "(");
    const closeParen = conditional.children.find((child) => child.type === ")");
    const elseKeyword = conditional.children.find((child) => child.type === "else");
    const condition = conditional.childForFieldName("condition");
    const consequence = conditional.childForFieldName("consequence");
    const alternative = conditional.childForFieldName("alternative");
    if (
      !keyword ||
      !openParen ||
      !closeParen ||
      !elseKeyword ||
      !condition ||
      !consequence ||
      !alternative
    ) {
      throw new Error("Unable to locate the conditional syntax");
    }
    const parentLambda = conditional.parent;
    const conditionalIndentation =
      parentLambda?.type === "lambda_expression" &&
      hasInlineMultilineConditionalLambdaBody(parentLambda)
        ? (lines[conditional.startPosition.row] ?? "").search(/\S|$/) + 2
        : conditional.startPosition.column;
    if (source.slice(keyword.endIndex, openParen.startIndex) !== " ") {
      const row = openParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.startPosition.column + 1,
        length: 1,
        rule: "format/conditional-keyword-spacing",
        message: "expected one space after 'if'",
        sourceLine: lines[row] ?? "",
      });
    }
    const expandsConditionDelimiters =
      condition.startPosition.row > openParen.endPosition.row ||
      closeParen.startPosition.row > condition.endPosition.row;
    const expectedAfterOpen = expandsConditionDelimiters
      ? `\n${" ".repeat(conditionalIndentation + 2)}`
      : "";
    const afterOpen = source.slice(openParen.endIndex, condition.startIndex);
    if (afterOpen !== expectedAfterOpen) {
      const row = openParen.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.endPosition.column + 1,
        length: Math.max(1, afterOpen.length),
        rule: "format/conditional-delimiter-spacing",
        message: expandsConditionDelimiters
          ? "expected a line break and two-space indentation after '('"
          : "expected no space after '('",
        sourceLine: lines[row] ?? "",
      });
    }
    const expectedBeforeClose = expandsConditionDelimiters
      ? `\n${" ".repeat(conditionalIndentation)}`
      : "";
    const beforeClose = source.slice(condition.endIndex, closeParen.startIndex);
    if (beforeClose !== expectedBeforeClose) {
      const row = closeParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: condition.endPosition.column + 1,
        length: Math.max(1, beforeClose.length),
        rule: "format/conditional-delimiter-spacing",
        message: expandsConditionDelimiters
          ? "expected ')' on a new line aligned with 'if'"
          : "expected no space before ')'",
        sourceLine: lines[row] ?? "",
      });
    }
    const consequenceComments = conditional.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= condition.endIndex &&
        child.endIndex <= consequence.startIndex,
    );
    const alternativeComments = conditional.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= consequence.endIndex &&
        child.endIndex <= alternative.startIndex,
    );
    const trailingConsequenceComments = alternativeComments.filter(
      (comment) => comment.startPosition.row === consequence.endPosition.row,
    );
    const leadingAlternativeComments = alternativeComments.filter(
      (comment) => !trailingConsequenceComments.some((trailing) => trailing.id === comment.id),
    );
    const inlineElseComment =
      leadingAlternativeComments.length === 1 &&
      leadingAlternativeComments[0]?.startPosition.row === elseKeyword.endPosition.row
        ? leadingAlternativeComments[0]
        : undefined;
    const expandsSourceMultilineCondition = condition.startPosition.row < condition.endPosition.row;
    const expandsConditionalChain = alternative.type === "if_expression";
    const formatsConditionalChain = expandsConditionalChain || isElseIfBranch(conditional);
    const hasSourceElseBreak = elseKeyword.startPosition.row > consequence.endPosition.row;
    const separatesCommentedElse = leadingAlternativeComments.length > 0;
    const sourceElseGap = source.slice(consequence.endIndex, elseKeyword.startIndex);
    const preservesBlankLineBeforeElse =
      consequence.type === "block_expression" &&
      leadingAlternativeComments.length === 0 &&
      /(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)/u.test(sourceElseGap);
    const preservesConsequenceLineBreak =
      consequence.type !== "block_expression" &&
      consequenceComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        hasSourceElseBreak ||
        leadingAlternativeComments.length > 0 ||
        consequence.startPosition.row > closeParen.endPosition.row);
    const expectedConsequenceGap = preservesConsequenceLineBreak
      ? `\n${" ".repeat(conditionalIndentation + 2)}`
      : " ";
    if (source.slice(closeParen.endIndex, consequence.startIndex) !== expectedConsequenceGap) {
      const row = closeParen.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: closeParen.endPosition.column + 1,
        length: 1,
        rule: "format/conditional-branch-spacing",
        message: preservesConsequenceLineBreak
          ? "expected a line break and two-space indentation after ')'"
          : "expected one space after ')'",
        sourceLine: lines[row] ?? "",
      });
    }
    const preservesElseLineBreak =
      consequence.type !== "block_expression" &&
      leadingAlternativeComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        elseKeyword.startPosition.row > consequence.endPosition.row);
    const preservesAlternativeLineBreak =
      alternative.type !== "block_expression" &&
      alternative.type !== "if_expression" &&
      leadingAlternativeComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        hasSourceElseBreak ||
        alternative.startPosition.row > elseKeyword.endPosition.row);
    const consequenceCloseBrace = consequence.children.find((child) => child.type === "}");
    const expectedElseGap = preservesBlankLineBeforeElse
      ? `\n\n${" ".repeat(consequenceCloseBrace?.startPosition.column ?? consequence.endPosition.column)}`
      : preservesElseLineBreak
        ? `\n${" ".repeat(conditionalIndentation)}`
        : separatesCommentedElse
          ? `\n${" ".repeat(conditionalIndentation)}`
          : " ";
    const expectedAlternativeGap = preservesAlternativeLineBreak
      ? `\n${" ".repeat(conditionalIndentation + 2)}`
      : " ";
    const hasCanonicalAlternativeGap = inlineElseComment
      ? /^[\t ]+$/.test(source.slice(elseKeyword.endIndex, inlineElseComment.startIndex)) &&
        source.slice(inlineElseComment.endIndex, alternative.startIndex) ===
          `\n${" ".repeat(conditionalIndentation + 2)}`
      : source.slice(elseKeyword.endIndex, alternative.startIndex) === expectedAlternativeGap;
    let trailingConsequenceAnchor = consequence;
    for (const comment of trailingConsequenceComments) {
      const gap = source.slice(trailingConsequenceAnchor.endIndex, comment.startIndex);
      if (!/^[\t ]+$/.test(gap)) {
        const row = comment.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: comment.startPosition.column + 1,
          length: 2,
          rule: "format/comment-spacing",
          message: "expected spacing before a trailing consequence comment",
          sourceLine: lines[row] ?? "",
        });
      }
      trailingConsequenceAnchor = comment;
    }
    if (
      source.slice(trailingConsequenceAnchor.endIndex, elseKeyword.startIndex) !==
        expectedElseGap ||
      !hasCanonicalAlternativeGap
    ) {
      const row = elseKeyword.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: elseKeyword.startPosition.column + 1,
        length: 4,
        rule: "format/conditional-else-spacing",
        message: preservesBlankLineBeforeElse
          ? "expected one blank line before 'else'"
          : preservesElseLineBreak || separatesCommentedElse || preservesAlternativeLineBreak
            ? "expected preserved line breaks and indentation around 'else'"
            : "expected one space around 'else'",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
