import type { AnalyzedSource } from "../core/analysis.js";
import type { FormatDiagnostic } from "../core/diagnostics.js";

export function checkCommentTrailingWhitespace(
  analyzedSource: AnalyzedSource,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const comments = [
    ...analyzedSource.modules.flatMap((module) => [
      ...module.leadingComments,
      ...module.node.descendantsOfType(["comment", "documentation_comment"]),
    ]),
    ...analyzedSource.trailingComments,
  ];
  const commentRows = new Set<number>();
  for (const comment of comments) {
    for (let row = comment.startPosition.row; row <= comment.endPosition.row; row += 1) {
      commentRows.add(row);
    }
  }

  const diagnostics: FormatDiagnostic[] = [];
  for (const row of commentRows) {
    const sourceLine = lines[row] ?? "";
    const trailingWhitespace = sourceLine.match(/[ \t]+$/u)?.[0];
    if (!trailingWhitespace) continue;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: sourceLine.length - trailingWhitespace.length + 1,
      length: trailingWhitespace.length,
      rule: "format/comment-trailing-whitespace",
      message: "unexpected trailing whitespace in comment",
      sourceLine,
    });
  }
  return diagnostics;
}

export function checkTrailingSourceComments(
  analyzedSource: AnalyzedSource,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const [index, comment] of analyzedSource.trailingComments.entries()) {
    if (comment.startPosition.column !== 0) {
      const row = comment.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, comment.startPosition.column),
        rule: "format/comment-indentation",
        message: "expected no indentation at the source level",
        sourceLine: lines[row] ?? "",
      });
    }
    const previous =
      index === 0
        ? analyzedSource.modules.at(-1)?.node
        : analyzedSource.trailingComments[index - 1];
    if (previous && source.slice(previous.endIndex, comment.startIndex) !== "\n\n") {
      const row = comment.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: comment.startPosition.column + 1,
        length: Math.max(1, comment.text.length),
        rule: "format/source-comment-separation",
        message: "expected one blank line before a trailing source comment",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
