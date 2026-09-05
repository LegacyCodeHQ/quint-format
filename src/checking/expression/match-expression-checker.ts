import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../core/diagnostics.js";
import { collectNodes, isCompactDefaultMatch } from "../../parsing/syntax.js";

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
    const compactArm = arms[0];
    const hasCanonicalCompactLayout = Boolean(
      compactDefaultMatch &&
        compactArm &&
        !compactArm.children.some((child) => child.type === "|") &&
        source.slice(openBrace.endIndex, compactArm.startIndex) === " " &&
        source.slice(compactArm.endIndex, closeBrace.startIndex) === " ",
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
        message: compactDefaultMatch
          ? "expected one space inside the compact default match braces"
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
        (child) =>
          (child.type === "comment" || child.type === "documentation_comment") &&
          child.endIndex <= body.startIndex,
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

      const combinatorField =
        body.type === "any_expression"
          ? "choice"
          : body.type === "or_block_expression"
            ? "disjunct"
            : body.type === "all_expression" || body.type === "and_block_expression"
              ? "conjunct"
              : undefined;
      if (combinatorField) {
        const entries = body.childrenForFieldName(combinatorField);
        const closeBrace = body.children.find((child) => child.type === "}");
        const expectedEntryColumn = arm.startPosition.column + 4;
        const expectedCloseColumn = arm.startPosition.column + 2;
        const misindentedNode =
          entries.find((entry) => entry.startPosition.column !== expectedEntryColumn) ??
          (closeBrace?.startPosition.column !== expectedCloseColumn ? closeBrace : undefined);
        if (misindentedNode) {
          const row = misindentedNode.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: 1,
            length: Math.max(1, misindentedNode.startPosition.column),
            rule: "format/match-arm-body-indentation",
            message: "expected the nested match-arm body to be indented one level",
            sourceLine: lines[row] ?? "",
          });
        }
      }
    }
  }

  return diagnostics;
}
