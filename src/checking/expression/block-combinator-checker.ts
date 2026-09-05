import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../diagnostics.js";
import { collectNodes } from "../../parsing/syntax.js";

const combinatorTypes = [
  ["any_expression", "choice"],
  ["all_expression", "conjunct"],
  ["and_block_expression", "conjunct"],
  ["or_block_expression", "disjunct"],
] as const;

export function checkBlockCombinators(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const [type, fieldName] of combinatorTypes) {
    for (const combinator of collectNodes(root, type)) {
      const openBrace = combinator.children.find((child) => child.type === "{");
      const closeBrace = combinator.children.find((child) => child.type === "}");
      const entries = combinator.childrenForFieldName(fieldName);
      const commas = combinator.children.filter((child) => child.type === ",");
      if (!openBrace || !closeBrace || entries.length === 0) {
        throw new Error("Unable to locate the block combinator layout");
      }
      const rows = entries.map((entry) => entry.startPosition.row);
      const comments = combinator.namedChildren.filter(
        (child) => child.type === "comment" || child.type === "documentation_comment",
      );
      const hasCompactLayout =
        openBrace.startPosition.row === closeBrace.startPosition.row &&
        rows.every((row) => row === openBrace.startPosition.row);
      const preservesCompactLayout =
        hasCompactLayout &&
        comments.length === 0 &&
        (lines[openBrace.startPosition.row]?.length ?? 0) <= 120;
      const hasCanonicalLines =
        preservesCompactLayout ||
        (rows[0] !== openBrace.startPosition.row &&
          rows.every((row, index) => index === 0 || row >= (rows[index - 1] as number)) &&
          closeBrace.startPosition.row > (rows.at(-1) as number));
      if (!hasCanonicalLines) {
        const row = openBrace.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openBrace.startPosition.column + 1,
          length: 1,
          rule: "format/block-combinator-layout",
          message: "expected choices and the closing brace on separate lines",
          sourceLine: lines[row] ?? "",
        });
      }
      if (preservesCompactLayout) {
        const firstEntry = entries[0] as Parser.SyntaxNode;
        const lastEntry = entries.at(-1) as Parser.SyntaxNode;
        if (
          source.slice(openBrace.endIndex, firstEntry.startIndex) !== " " ||
          source.slice(lastEntry.endIndex, closeBrace.startIndex) !== " "
        ) {
          const row = openBrace.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: openBrace.endPosition.column + 1,
            length: 1,
            rule: "format/block-combinator-brace-spacing",
            message: "expected one space inside compact block-combinator braces",
            sourceLine: lines[row] ?? "",
          });
        }
      }
      const openingComment = combinator.namedChildren.find(
        (child) =>
          (child.type === "comment" || child.type === "documentation_comment") &&
          child.startPosition.row === openBrace.endPosition.row,
      );
      const firstContent = combinator.namedChildren.find(
        (child) => child.id !== openingComment?.id,
      );
      const openingAnchor = openingComment ?? openBrace;
      if (
        !preservesCompactLayout &&
        firstContent &&
        firstContent.startPosition.row > openingAnchor.endPosition.row + 1
      ) {
        const row = openingAnchor.endPosition.row + 1;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: 1,
          rule: "format/block-combinator-opening-gap",
          message: "expected block contents directly after the opening brace",
          sourceLine: lines[row] ?? "",
        });
      }
      if (openingComment && source.slice(openBrace.endIndex, openingComment.startIndex) !== " ") {
        const row = openingComment.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openBrace.endPosition.column + 1,
          length: Math.max(1, openingComment.startIndex - openBrace.endIndex),
          rule: "format/block-combinator-opening-comment-spacing",
          message: "expected one space before the block-opening comment",
          sourceLine: lines[row] ?? "",
        });
      }
      for (const [index, entry] of entries.entries()) {
        const comma = commas[index];
        if (preservesCompactLayout && index === entries.length - 1) {
          if (comma) {
            const row = comma.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: comma.startPosition.column + 1,
              length: 1,
              rule: "format/block-combinator-separator-spacing",
              message: "expected no trailing comma in a compact block combinator",
              sourceLine: lines[row] ?? "",
            });
          }
          continue;
        }
        if (!comma) {
          const row = entry.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: entry.endPosition.column + 1,
            length: 1,
            rule: "format/block-combinator-separator-spacing",
            message: "expected a trailing comma after each block entry",
            sourceLine: lines[row] ?? "",
          });
          continue;
        }
        const previous = entries[index];
        if (previous && source.slice(previous.endIndex, comma.startIndex) !== "") {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/block-combinator-separator-spacing",
            message: "expected no space before ','",
            sourceLine: lines[row] ?? "",
          });
        }
        const next = entries[index + 1];
        if (
          next &&
          next.startPosition.row === comma.endPosition.row &&
          source.slice(comma.endIndex, next.startIndex) !== " "
        ) {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.endPosition.column + 1,
            length: Math.max(1, next.startIndex - comma.endIndex),
            rule: "format/block-combinator-separator-spacing",
            message: "expected one space after ',' between grouped block entries",
            sourceLine: lines[row] ?? "",
          });
        }
      }
    }
  }
  return diagnostics;
}
