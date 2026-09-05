import type { AnalyzedSourceModule } from "@/core/analysis.js";
import type { FormatDiagnostic } from "@/core/diagnostics.js";

export function checkModuleLayout(
  module: AnalyzedSourceModule,
  previousModule: AnalyzedSourceModule | undefined,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  const moduleStart = module.leadingComments[0] ?? module.node;

  for (const comment of module.leadingComments) {
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
  }

  if (previousModule) {
    const moduleGap = source.slice(previousModule.node.endIndex, moduleStart.startIndex);
    if (moduleGap !== "\n\n") {
      const row = module.moduleKeyword.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: module.moduleKeyword.startPosition.column + 1,
        length: module.moduleKeyword.text.length,
        rule: "format/module-separation",
        message: "expected one blank line between modules",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const keywordGap = source.slice(module.moduleKeyword.endIndex, module.nameNode.startIndex);

  if (keywordGap !== " ") {
    const row = module.moduleKeyword.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: module.moduleKeyword.endPosition.column + 1,
      length: Math.max(
        1,
        module.nameNode.startPosition.column - module.moduleKeyword.endPosition.column,
      ),
      rule: "format/module-keyword-spacing",
      message: "expected one space after 'module'",
      sourceLine: lines[row] ?? "",
    });
  }

  const braceGap = source.slice(module.nameNode.endIndex, module.openBrace.startIndex);

  if (braceGap !== " ") {
    const row = module.nameNode.endPosition.row;
    const hasGap = module.openBrace.startPosition.column > module.nameNode.endPosition.column;
    diagnostics.push({
      filePath,
      line: row + 1,
      column:
        (hasGap ? module.nameNode.endPosition.column : module.openBrace.startPosition.column) + 1,
      length: Math.max(
        1,
        module.openBrace.startPosition.column - module.nameNode.endPosition.column,
      ),
      rule: "format/module-brace-spacing",
      message: "expected one space before '{'",
      sourceLine: lines[row] ?? "",
    });
  }

  if (
    module.declarations.length === 0 &&
    module.danglingComments.length === 0 &&
    module.openBrace.startPosition.row === module.closeBrace.startPosition.row
  ) {
    const row = module.openBrace.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: module.openBrace.startPosition.column + 1,
      length: Math.max(
        1,
        module.closeBrace.endPosition.column - module.openBrace.startPosition.column,
      ),
      rule: "format/empty-module",
      message: "empty module braces must be on separate lines",
      sourceLine: lines[row] ?? "",
    });
  }

  for (const comment of module.danglingComments) {
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

  return diagnostics;
}
