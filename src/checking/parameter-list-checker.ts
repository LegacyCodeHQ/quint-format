import type Parser from "tree-sitter";
import type { ModuleDeclaration } from "@/core/analysis.js";
import type { FormatDiagnostic } from "@/core/diagnostics.js";

export function checkParameterList(
  declaration: ModuleDeclaration,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  if (!declaration.openParen || !declaration.closeParen) return [];

  const diagnostics: FormatDiagnostic[] = [];
  if (declaration.parameters?.length === 0) {
    const beforeOpenParen = source.slice(
      declaration.nameNode.endIndex,
      declaration.openParen.startIndex,
    );
    const insideParentheses = source.slice(
      declaration.openParen.endIndex,
      declaration.closeParen.startIndex,
    );
    if (beforeOpenParen !== "" || insideParentheses !== "") {
      const row = declaration.openParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: declaration.openParen.startPosition.column + 1,
        length: 1,
        rule: "format/parameter-list-spacing",
        message: "expected no space around an empty parameter list",
        sourceLine: lines[row] ?? "",
      });
    }
    return diagnostics;
  }

  if (!declaration.parameters?.length) return diagnostics;

  const firstParameter = declaration.parameters[0];
  const lastParameter = declaration.parameters.at(-1);
  if (!firstParameter || !lastParameter) {
    throw new Error("Unable to locate the definition parameters");
  }
  const beforeOpenParen = source.slice(
    declaration.nameNode.endIndex,
    declaration.openParen.startIndex,
  );
  if (beforeOpenParen !== "") {
    const row = declaration.openParen.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.nameNode.endPosition.column + 1,
      length: Math.max(1, beforeOpenParen.length),
      rule: "format/parameter-list-spacing",
      message: "expected no space before '('",
      sourceLine: lines[row] ?? "",
    });
  }

  if (declaration.expandedParameterList) {
    const parameterIndent = declaration.keyword.startPosition.column + 2;
    const hasCanonicalBreak = (left: Parser.SyntaxNode, right: Parser.SyntaxNode) =>
      right.startPosition.row === left.endPosition.row + 1 &&
      right.startPosition.column === parameterIndent;
    if (!hasCanonicalBreak(declaration.openParen, firstParameter)) {
      const row = firstParameter.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: firstParameter.startPosition.column + 1,
        length: Math.max(1, firstParameter.text.length),
        rule: "format/multiline-parameter-layout",
        message: "expected the first parameter on an indented line",
        sourceLine: lines[row] ?? "",
      });
    }

    const commas = declaration.parameterCommas ?? [];
    for (const [index, parameter] of declaration.parameters.entries()) {
      const comma = commas[index];
      const next = declaration.parameters[index + 1] ?? declaration.closeParen;
      if (!comma || comma.startIndex < parameter.endIndex || comma.endIndex > next.startIndex) {
        const row = parameter.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: parameter.endPosition.column + 1,
          length: 1,
          rule: "format/multiline-parameter-layout",
          message: "expected a trailing comma after the parameter",
          sourceLine: lines[row] ?? "",
        });
        continue;
      }
      if (
        source.slice(parameter.endIndex, comma.startIndex) !== "" ||
        !hasCanonicalBreak(comma, next)
      ) {
        const row = comma.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: comma.startPosition.column + 1,
          length: 1,
          rule: "format/multiline-parameter-layout",
          message:
            next.id === declaration.closeParen.id
              ? "expected the closing parenthesis on its own line"
              : "expected one parameter per indented line",
          sourceLine: lines[row] ?? "",
        });
      }
    }
    return diagnostics;
  }

  const afterOpenParen = source.slice(declaration.openParen.endIndex, firstParameter.startIndex);
  if (afterOpenParen !== "") {
    const row = declaration.openParen.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.openParen.endPosition.column + 1,
      length: Math.max(1, afterOpenParen.length),
      rule: "format/parameter-list-spacing",
      message: "expected no space after '('",
      sourceLine: lines[row] ?? "",
    });
  }

  for (const [index, comma] of (declaration.parameterCommas ?? []).entries()) {
    const previousParameter = declaration.parameters[index];
    const nextParameter = declaration.parameters[index + 1];
    if (!previousParameter || !nextParameter) {
      throw new Error("Unable to locate parameters around ','");
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
        rule: "format/parameter-separator-spacing",
        message: "expected ', ' between parameters",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const beforeCloseParen = source.slice(lastParameter.endIndex, declaration.closeParen.startIndex);
  if (beforeCloseParen !== "") {
    const row = declaration.closeParen.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: lastParameter.endPosition.column + 1,
      length: Math.max(1, beforeCloseParen.length),
      rule: "format/parameter-list-spacing",
      message: "expected no space before ')'",
      sourceLine: lines[row] ?? "",
    });
  }

  return diagnostics;
}
