import type { ModuleDeclaration } from "@/core/analysis.js";
import type { FormatDiagnostic } from "@/core/diagnostics.js";

export function checkTypeAnnotations(
  declaration: ModuleDeclaration,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const parameter of declaration.parameters ?? []) {
    const parameterName = parameter.childForFieldName("name");
    const parameterType = parameter.childForFieldName("type");
    const parameterColon = parameter.children.find((child) => child.type === ":");
    if (!parameterName || !parameterType || !parameterColon) continue;

    const colonGap = source.slice(parameterName.endIndex, parameterColon.startIndex);
    if (colonGap.length > 0) {
      const row = parameterName.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: parameterName.endPosition.column + 1,
        length: Math.max(1, parameterColon.startPosition.column - parameterName.endPosition.column),
        rule: "format/type-colon-spacing",
        message: "expected no space before ':'",
        sourceLine: lines[row] ?? "",
      });
    }

    const typeGap = source.slice(parameterColon.endIndex, parameterType.startIndex);
    if (typeGap !== " ") {
      const row = parameterColon.endPosition.row;
      const hasGap = parameterType.startPosition.column > parameterColon.endPosition.column;
      diagnostics.push({
        filePath,
        line: row + 1,
        column:
          (hasGap ? parameterColon.endPosition.column : parameterType.startPosition.column) + 1,
        length: Math.max(1, parameterType.startPosition.column - parameterColon.endPosition.column),
        rule: "format/type-colon-spacing",
        message: "expected one space after ':'",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  if (!declaration.colon || !declaration.typeNode) return diagnostics;

  const typeAnchor = declaration.typeAnchor ?? declaration.nameNode;
  const colonGap = source.slice(typeAnchor.endIndex, declaration.colon.startIndex);
  if (colonGap.length > 0) {
    const row = typeAnchor.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: typeAnchor.endPosition.column + 1,
      length: Math.max(1, declaration.colon.startPosition.column - typeAnchor.endPosition.column),
      rule: "format/type-colon-spacing",
      message: "expected no space before ':'",
      sourceLine: lines[row] ?? "",
    });
  }

  const typeGap = source.slice(declaration.colon.endIndex, declaration.typeNode.startIndex);
  const preservesDeclarationAlignment =
    (declaration.keyword.type === "var" || declaration.keyword.type === "const") &&
    /^ +$/u.test(typeGap);
  if (typeGap !== " " && !preservesDeclarationAlignment) {
    const row = declaration.colon.endPosition.row;
    const hasGap = declaration.typeNode.startPosition.column > declaration.colon.endPosition.column;
    diagnostics.push({
      filePath,
      line: row + 1,
      column:
        (hasGap
          ? declaration.colon.endPosition.column
          : declaration.typeNode.startPosition.column) + 1,
      length: Math.max(
        1,
        declaration.typeNode.startPosition.column - declaration.colon.endPosition.column,
      ),
      rule: "format/type-colon-spacing",
      message: "expected one space after ':'",
      sourceLine: lines[row] ?? "",
    });
  }

  return diagnostics;
}
