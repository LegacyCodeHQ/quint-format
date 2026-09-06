import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
import { collectNodes, compactBlockExpression } from "@/parsing/syntax.js";

export function checkBlockExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
  commentAttachments: CommentAttachmentIndex,
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const block of collectNodes(root, "block_expression")) {
    const openBrace = block.children.find((child) => child.type === "{");
    const closeBrace = block.children.find((child) => child.type === "}");
    const expression = block.childForFieldName("expression");
    const bindings = block.childrenForFieldName("binding");
    const firstContent = bindings[0] ?? expression;
    if (!openBrace || !closeBrace || !expression || !firstContent) {
      throw new Error("Unable to locate the block layout");
    }
    const contentNodes = [...bindings, expression];
    const rows = contentNodes.map((content) => content.startPosition.row);
    const isCompactBlock = Boolean(compactBlockExpression(block, commentAttachments));
    if (isCompactBlock) {
      const afterOpenBrace = source.slice(openBrace.endIndex, expression.startIndex);
      const beforeCloseBrace = source.slice(expression.endIndex, closeBrace.startIndex);
      if (afterOpenBrace !== " " || beforeCloseBrace !== " ") {
        const row = openBrace.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openBrace.startPosition.column + 1,
          length: 1,
          rule: "format/block-brace-spacing",
          message: "expected one space inside compact block braces",
          sourceLine: lines[row] ?? "",
        });
      }
    }
    const hasCanonicalLines =
      isCompactBlock ||
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
        rule: "format/block-layout",
        message: "expected block contents and the closing brace on separate lines",
        sourceLine: lines[row] ?? "",
      });
    }
    const finalContent = block.namedChildren.at(-1);
    if (finalContent && closeBrace.startPosition.row > finalContent.endPosition.row) {
      const closingGap = source.slice(finalContent.endIndex, closeBrace.startIndex);
      const lineBreakCount = closingGap.match(/\r\n|\r|\n/gu)?.length ?? 0;
      const preservesClosingBlankLine =
        closeBrace.startPosition.row > finalContent.endPosition.row + 1;
      const expectedLineBreakCount = preservesClosingBlankLine ? 2 : 1;
      if (lineBreakCount !== expectedLineBreakCount) {
        const row = closeBrace.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: closeBrace.startPosition.column + 1,
          length: 1,
          rule: "format/block-closing-gap",
          message: "expected one blank line before the block closing brace",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }
  return diagnostics;
}
