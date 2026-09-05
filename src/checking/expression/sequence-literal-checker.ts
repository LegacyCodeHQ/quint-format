import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";

export function checkSequenceLiterals(
  sequenceLiterals: Parser.SyntaxNode[],
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const sequenceLiteral of sequenceLiterals) {
    const isList = sequenceLiteral.type === "list_literal";
    const kind = isList ? "list" : "tuple";
    const openType = isList ? "[" : "(";
    const closeType = isList ? "]" : ")";
    const openDelimiter = sequenceLiteral.children.find((child) => child.type === openType);
    const closeDelimiter = sequenceLiteral.children.find((child) => child.type === closeType);
    const elements = sequenceLiteral.childrenForFieldName("element");
    const commas = sequenceLiteral.children.filter((child) => child.type === ",");
    if (!openDelimiter || !closeDelimiter) {
      throw new Error(`Unable to locate the ${kind} literal delimiters`);
    }

    const firstElement = elements[0];
    const lastElement = elements.at(-1);
    if (firstElement && lastElement) {
      const afterOpenDelimiter = source.slice(openDelimiter.endIndex, firstElement.startIndex);
      const expectedOpenGap = "";
      if (afterOpenDelimiter !== expectedOpenGap) {
        const row = openDelimiter.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openDelimiter.endPosition.column + 1,
          length: Math.max(1, afterOpenDelimiter.length),
          rule: "format/expression-delimiter-spacing",
          message: `expected no space after '${openType}'`,
          sourceLine: lines[row] ?? "",
        });
      }

      for (const [index, comma] of commas.entries()) {
        const previousElement = elements[index];
        const nextElement = elements[index + 1];
        if (!previousElement || !nextElement) {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/unnecessary-trailing-comma",
            message: `trailing commas are omitted from inline ${kind}s`,
            sourceLine: lines[row] ?? "",
          });
          continue;
        }
        const beforeComma = source.slice(previousElement.endIndex, comma.startIndex);
        const afterComma = source.slice(comma.endIndex, nextElement.startIndex);
        if (beforeComma !== "" || afterComma !== " ") {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/expression-separator-spacing",
            message: `expected ', ' between ${kind} elements`,
            sourceLine: lines[row] ?? "",
          });
        }
      }

      const beforeCloseDelimiter = source.slice(lastElement.endIndex, closeDelimiter.startIndex);
      const trailingComma = commas.find((comma) => comma.startIndex >= lastElement.endIndex);
      const closeAnchor = trailingComma ?? lastElement;
      const closeGap = source.slice(closeAnchor.endIndex, closeDelimiter.startIndex);
      const expectedCloseGap = "";
      if (
        (!trailingComma && beforeCloseDelimiter !== expectedCloseGap) ||
        (trailingComma && closeGap !== expectedCloseGap)
      ) {
        const row = closeDelimiter.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: closeAnchor.endPosition.column + 1,
          length: Math.max(1, closeGap.length),
          rule: "format/expression-delimiter-spacing",
          message: `expected no space before '${closeType}'`,
          sourceLine: lines[row] ?? "",
        });
      }
    } else {
      const insideDelimiters = source.slice(openDelimiter.endIndex, closeDelimiter.startIndex);
      if (insideDelimiters !== "") {
        const row = openDelimiter.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openDelimiter.endPosition.column + 1,
          length: Math.max(1, insideDelimiters.length),
          rule: "format/expression-delimiter-spacing",
          message: `expected no space inside '${openType}${closeType}'`,
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }

  return diagnostics;
}
