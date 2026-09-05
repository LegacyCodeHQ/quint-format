import type { ModuleDeclaration } from "@/core/analysis.js";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import { preservesTrailingCommentAlignment } from "@/formatting/comments.js";

export function checkDeclarationLayout(
  declaration: ModuleDeclaration,
  previousDeclaration: ModuleDeclaration | undefined,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  const declarationStart = declaration.leadingComments?.[0] ?? declaration.node;
  const sharesLineWithPrevious =
    previousDeclaration?.node.endPosition.row === declarationStart.startPosition.row;
  const previousDeclarationEnd =
    previousDeclaration?.trailingComments?.at(-1) ?? previousDeclaration?.node;
  const groupsCommentedImports = Boolean(
    previousDeclaration?.keyword.text === "import" && declaration.keyword.text === "import",
  );
  const requiresCommentedDeclarationSeparation = Boolean(
    previousDeclaration && declaration.leadingComments?.length && !groupsCommentedImports,
  );

  if (
    requiresCommentedDeclarationSeparation &&
    previousDeclarationEnd &&
    declarationStart.startPosition.row - previousDeclarationEnd.endPosition.row !== 2
  ) {
    const row = declarationStart.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declarationStart.startPosition.column + 1,
      length: Math.max(1, declarationStart.text.length),
      rule: "format/commented-declaration-separation",
      message: "expected exactly one blank line before a leading comment block",
      sourceLine: lines[row] ?? "",
    });
  }

  for (const comment of declaration.leadingComments ?? []) {
    if (comment.startPosition.column !== 2) {
      const row = comment.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, comment.startPosition.column),
        rule: "format/comment-indentation",
        message: "expected 2 spaces of indentation",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  for (const [commentIndex, comment] of (declaration.trailingComments ?? []).entries()) {
    const previousTrailingComment = declaration.trailingComments?.[commentIndex - 1];
    const startsIndentedTrailingComment =
      commentIndex === 0 &&
      comment.startPosition.row === declaration.node.endPosition.row + 1 &&
      comment.startPosition.column > declaration.node.startPosition.column;
    if (
      startsIndentedTrailingComment ||
      (previousTrailingComment &&
        comment.startPosition.row === previousTrailingComment.endPosition.row + 1 &&
        comment.startPosition.column === previousTrailingComment.startPosition.column)
    ) {
      continue;
    }
    const commentGap = source.slice(declaration.node.endIndex, comment.startIndex);
    const preservesAlignment =
      declaration.valueNode?.type === "sum_type" || preservesTrailingCommentAlignment(commentGap);
    if (!preservesAlignment && commentGap !== " ") {
      const row = comment.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: comment.startPosition.column + 1,
        length: 2,
        rule: "format/comment-spacing",
        message: "expected one space before a trailing comment",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  if (sharesLineWithPrevious) {
    const row = declaration.node.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.node.startPosition.column + 1,
      length: declaration.keyword.text.length,
      rule: "format/declaration-line-break",
      message: "expected each declaration on a separate line",
      sourceLine: lines[row] ?? "",
    });
  } else if (declaration.node.startPosition.column !== 2) {
    const row = declaration.node.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: 1,
      length: Math.max(1, declaration.node.startPosition.column),
      rule: "format/module-body-indentation",
      message: "expected 2 spaces of indentation",
      sourceLine: lines[row] ?? "",
    });
  }

  if (declaration.qualifier) {
    const qualifierGap = source.slice(
      declaration.qualifier.endIndex,
      declaration.keyword.startIndex,
    );
    if (qualifierGap !== " ") {
      const row = declaration.qualifier.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: declaration.qualifier.endPosition.column + 1,
        length: Math.max(
          1,
          declaration.keyword.startPosition.column - declaration.qualifier.endPosition.column,
        ),
        rule: "format/qualifier-spacing",
        message: `expected one space after '${declaration.qualifier.text}'`,
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const keywordGap = source.slice(declaration.keyword.endIndex, declaration.nameNode.startIndex);
  if (keywordGap !== " ") {
    const row = declaration.keyword.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.keyword.endPosition.column + 1,
      length: Math.max(
        1,
        declaration.nameNode.startPosition.column - declaration.keyword.endPosition.column,
      ),
      rule: "format/declaration-keyword-spacing",
      message: `expected one space after '${declaration.keyword.text}'`,
      sourceLine: lines[row] ?? "",
    });
  }

  return diagnostics;
}
