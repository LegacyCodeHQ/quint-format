import type { ModuleDeclaration } from "../core/analysis.js";
import type { FormatDiagnostic } from "../core/diagnostics.js";

export function checkTypeParameters(
  declaration: ModuleDeclaration,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  if (
    !declaration.typeOpenBracket ||
    !declaration.typeCloseBracket ||
    !declaration.typeParameters?.length
  ) {
    return [];
  }

  const firstParameter = declaration.typeParameters[0];
  const lastParameter = declaration.typeParameters.at(-1);
  if (!firstParameter || !lastParameter) {
    throw new Error("Unable to locate the type parameters");
  }

  const diagnostics: FormatDiagnostic[] = [];
  const beforeOpenBracket = source.slice(
    declaration.nameNode.endIndex,
    declaration.typeOpenBracket.startIndex,
  );
  if (beforeOpenBracket !== "") {
    const row = declaration.typeOpenBracket.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.nameNode.endPosition.column + 1,
      length: Math.max(1, beforeOpenBracket.length),
      rule: "format/type-parameter-list-spacing",
      message: "expected no space before '['",
      sourceLine: lines[row] ?? "",
    });
  }

  const afterOpenBracket = source.slice(
    declaration.typeOpenBracket.endIndex,
    firstParameter.startIndex,
  );
  if (afterOpenBracket !== "") {
    const row = declaration.typeOpenBracket.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.typeOpenBracket.endPosition.column + 1,
      length: Math.max(1, afterOpenBracket.length),
      rule: "format/type-parameter-list-spacing",
      message: "expected no space after '['",
      sourceLine: lines[row] ?? "",
    });
  }

  for (const [index, comma] of (declaration.typeParameterCommas ?? []).entries()) {
    const previousParameter = declaration.typeParameters[index];
    const nextParameter = declaration.typeParameters[index + 1];
    if (!previousParameter || !nextParameter) {
      throw new Error("Unable to locate type parameters around ','");
    }
    const beforeComma = source.slice(previousParameter.endIndex, comma.startIndex);
    const afterComma = source.slice(comma.endIndex, nextParameter.startIndex);
    if (beforeComma !== "" || afterComma !== " ") {
      const row = comma.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: comma.startPosition.column + 1,
        length: 1,
        rule: "format/type-parameter-separator-spacing",
        message: "expected ', ' between type parameters",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const beforeCloseBracket = source.slice(
    lastParameter.endIndex,
    declaration.typeCloseBracket.startIndex,
  );
  if (beforeCloseBracket !== "") {
    const row = declaration.typeCloseBracket.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: lastParameter.endPosition.column + 1,
      length: Math.max(1, beforeCloseBracket.length),
      rule: "format/type-parameter-list-spacing",
      message: "expected no space before ']'",
      sourceLine: lines[row] ?? "",
    });
  }

  return diagnostics;
}
