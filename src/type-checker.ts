import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "./diagnostics.js";
import { checkFunctionType } from "./function-type-checker.js";
import { checkOperatorType } from "./operator-type-checker.js";
import { checkParenthesizedType } from "./parenthesized-type-checker.js";
import { checkRecordType } from "./record-type-checker.js";
import { checkSumType } from "./sum-type-checker.js";
import type { TypeCheckContext } from "./type-check-context.js";
import { checkUnitType } from "./unit-type-checker.js";

export function checkTypeDelimiterSpacing(
  node: Parser.SyntaxNode,
  source: string,
  lines: string[],
  filePath: string,
  diagnostics: FormatDiagnostic[],
) {
  const context: TypeCheckContext = {
    source,
    lines,
    filePath,
    diagnostics,
    check: (child) => checkTypeDelimiterSpacing(child, source, lines, filePath, diagnostics),
  };
  if (checkUnitType(node, context)) return;
  if (checkSumType(node, context)) return;
  if (checkParenthesizedType(node, context)) return;
  if (checkOperatorType(node, context)) return;
  if (checkFunctionType(node, context)) return;
  if (checkRecordType(node, context)) return;

  if (
    node.type !== "set_type" &&
    node.type !== "list_type" &&
    node.type !== "type_application" &&
    node.type !== "tuple_type"
  ) {
    return;
  }

  const openDelimiterText = node.type === "tuple_type" ? "(" : "[";
  const closeDelimiterText = node.type === "tuple_type" ? ")" : "]";
  const openDelimiter = node.children.find((child) => child.type === openDelimiterText);
  const closeDelimiter = node.children.find((child) => child.type === closeDelimiterText);
  const elements =
    node.type === "type_application"
      ? node.childrenForFieldName("argument")
      : node.type === "tuple_type"
        ? node.childrenForFieldName("element")
        : [node.childForFieldName("element")].filter((element) => element !== null);
  const firstElement = elements[0];
  const lastElement = elements.at(-1);
  if (!openDelimiter || !closeDelimiter || !firstElement || !lastElement) {
    throw new Error("Unable to locate the parameterized type delimiters");
  }

  const afterOpenDelimiter = source.slice(openDelimiter.endIndex, firstElement.startIndex);
  if (afterOpenDelimiter !== "") {
    const row = openDelimiter.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: openDelimiter.endPosition.column + 1,
      length: Math.max(1, afterOpenDelimiter.length),
      rule: "format/type-delimiter-spacing",
      message: `expected no space after '${openDelimiterText}'`,
      sourceLine: lines[row] ?? "",
    });
  }

  const commas = node.children.filter((child) => child.type === ",");
  for (const [index, comma] of commas.entries()) {
    const previousElement = elements[index];
    const nextElement = elements[index + 1];
    if (!previousElement || !nextElement) {
      throw new Error("Unable to locate types around ','");
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
        rule: "format/type-separator-spacing",
        message: "expected ', ' between types",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const beforeCloseDelimiter = source.slice(lastElement.endIndex, closeDelimiter.startIndex);
  if (beforeCloseDelimiter !== "") {
    const row = closeDelimiter.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: lastElement.endPosition.column + 1,
      length: Math.max(1, beforeCloseDelimiter.length),
      rule: "format/type-delimiter-spacing",
      message: `expected no space before '${closeDelimiterText}'`,
      sourceLine: lines[row] ?? "",
    });
  }

  for (const element of elements) {
    checkTypeDelimiterSpacing(element, source, lines, filePath, diagnostics);
  }
}
