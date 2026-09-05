import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "./diagnostics.js";
import { checkFunctionType } from "./function-type-checker.js";
import { checkOperatorType } from "./operator-type-checker.js";
import { checkParenthesizedType } from "./parenthesized-type-checker.js";
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

  if (node.type === "record_type") {
    const openBrace = node.children.find((child) => child.type === "{");
    const closeBrace = node.children.find((child) => child.type === "}");
    const fields = node.namedChildren.filter((child) => child.type === "record_type_field");
    const row = node.childForFieldName("row");
    const hasComments = node.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
    const isExpanded = hasComments || node.startPosition.row < node.endPosition.row;
    const firstField = fields[0];
    const lastField = fields.at(-1);
    if (!openBrace || !closeBrace) {
      throw new Error("Unable to locate the record type delimiters");
    }
    if (!firstField || !lastField) {
      const insideBraces = source.slice(openBrace.endIndex, closeBrace.startIndex);
      if (insideBraces !== "") {
        const row = openBrace.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openBrace.endPosition.column + 1,
          length: Math.max(1, insideBraces.length),
          rule: "format/type-delimiter-spacing",
          message: "expected no space inside an empty record type",
          sourceLine: lines[row] ?? "",
        });
      }
      return;
    }

    const afterOpenBrace = source.slice(openBrace.endIndex, firstField.startIndex);
    if (!isExpanded && afterOpenBrace !== " ") {
      const row = openBrace.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openBrace.endPosition.column + 1,
        length: Math.max(1, afterOpenBrace.length),
        rule: "format/type-delimiter-spacing",
        message: "expected one space after '{'",
        sourceLine: lines[row] ?? "",
      });
    }

    const commas = node.children.filter((child) => child.type === ",");
    for (const [index, comma] of commas.entries()) {
      if (isExpanded) continue;
      const previousField = fields[index];
      const nextField = fields[index + 1];
      if (!previousField || !nextField) {
        throw new Error("Unable to locate record fields around ','");
      }
      const beforeComma = source.slice(previousField.endIndex, comma.startIndex);
      const afterComma = source.slice(comma.endIndex, nextField.startIndex);
      if (beforeComma !== "" || afterComma !== " ") {
        const row = comma.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: comma.startPosition.column + 1,
          length: 1,
          rule: "format/type-separator-spacing",
          message: "expected ', ' between record fields",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    for (const field of fields) {
      const name = field.childForFieldName("name");
      const fieldType = field.childForFieldName("type");
      const colon = field.children.find((child) => child.type === ":");
      if (!name || !fieldType || !colon) {
        throw new Error("Unable to locate a record field annotation");
      }
      const beforeColon = source.slice(name.endIndex, colon.startIndex);
      if (beforeColon !== "") {
        const row = name.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: name.endPosition.column + 1,
          length: Math.max(1, beforeColon.length),
          rule: "format/type-colon-spacing",
          message: "expected no space before ':'",
          sourceLine: lines[row] ?? "",
        });
      }
      const afterColon = source.slice(colon.endIndex, fieldType.startIndex);
      if (afterColon !== " ") {
        const row = colon.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: colon.endPosition.column + 1,
          length: Math.max(1, afterColon.length),
          rule: "format/type-colon-spacing",
          message: "expected one space after ':'",
          sourceLine: lines[row] ?? "",
        });
      }
      checkTypeDelimiterSpacing(fieldType, source, lines, filePath, diagnostics);
    }

    if (row && !isExpanded) {
      const pipe = node.children.find((child) => child.type === "|");
      if (!pipe) {
        throw new Error("Unable to locate the record row separator");
      }
      const beforePipe = source.slice(lastField.endIndex, pipe.startIndex);
      const afterPipe = source.slice(pipe.endIndex, row.startIndex);
      if (beforePipe !== " " || afterPipe !== " ") {
        const rowIndex = pipe.startPosition.row;
        diagnostics.push({
          filePath,
          line: rowIndex + 1,
          column: pipe.startPosition.column + 1,
          length: 1,
          rule: "format/record-row-spacing",
          message: "expected one space around '|'",
          sourceLine: lines[rowIndex] ?? "",
        });
      }
    }

    const recordEnd = row ?? lastField;
    const beforeCloseBrace = source.slice(recordEnd.endIndex, closeBrace.startIndex);
    if (!isExpanded && beforeCloseBrace !== " ") {
      const row = closeBrace.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: recordEnd.endPosition.column + 1,
        length: Math.max(1, beforeCloseBrace.length),
        rule: "format/type-delimiter-spacing",
        message: "expected one space before '}'",
        sourceLine: lines[row] ?? "",
      });
    }
    return;
  }

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
