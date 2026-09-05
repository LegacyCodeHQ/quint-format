import type { ModuleDeclaration } from "../core/analysis.js";
import type { FormatDiagnostic } from "../core/diagnostics.js";

export function checkOptionalSemicolon(
  declaration: ModuleDeclaration,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  if (!declaration.semicolon) return [];

  const row = declaration.semicolon.startPosition.row;
  return [
    {
      filePath,
      line: row + 1,
      column: declaration.semicolon.startPosition.column + 1,
      length: 1,
      rule: "format/unnecessary-semicolon",
      message: "optional semicolons are omitted",
      sourceLine: lines[row] ?? "",
    },
  ];
}
