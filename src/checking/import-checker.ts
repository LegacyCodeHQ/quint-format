import type { ModuleDeclaration } from "../analysis.js";
import type { FormatDiagnostic } from "../diagnostics.js";

export function checkImportSpacing(
  declaration: ModuleDeclaration,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  if (declaration.dot && declaration.selectorNode) {
    const selectorAnchor = declaration.instanceCloseParen ?? declaration.nameNode;
    const beforeDot = source.slice(selectorAnchor.endIndex, declaration.dot.startIndex);
    const afterDot = source.slice(declaration.dot.endIndex, declaration.selectorNode.startIndex);
    if (beforeDot !== "" || afterDot !== "") {
      const row = declaration.dot.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: declaration.dot.startPosition.column + 1,
        length: 1,
        rule: "format/import-selector-spacing",
        message: "expected no space around '.'",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  if (declaration.aliasNode && declaration.asKeyword) {
    const aliasAnchor = declaration.instanceCloseParen ?? declaration.nameNode;
    const beforeAs = source.slice(aliasAnchor.endIndex, declaration.asKeyword.startIndex);
    const afterAs = source.slice(declaration.asKeyword.endIndex, declaration.aliasNode.startIndex);
    if (beforeAs !== " " || afterAs !== " ") {
      const row = declaration.asKeyword.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: declaration.asKeyword.startPosition.column + 1,
        length: 2,
        rule: "format/import-alias-spacing",
        message: "expected one space around 'as'",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  if (declaration.sourceNode && declaration.fromKeyword) {
    const sourceAnchor =
      declaration.aliasNode ??
      declaration.selectorNode ??
      declaration.instanceCloseParen ??
      declaration.nameNode;
    const beforeFrom = source.slice(sourceAnchor.endIndex, declaration.fromKeyword.startIndex);
    const afterFrom = source.slice(
      declaration.fromKeyword.endIndex,
      declaration.sourceNode.startIndex,
    );
    if (beforeFrom !== " " || afterFrom !== " ") {
      const row = declaration.fromKeyword.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: declaration.fromKeyword.startPosition.column + 1,
        length: 4,
        rule: "format/import-source-spacing",
        message: "expected one space around 'from'",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  return diagnostics;
}
