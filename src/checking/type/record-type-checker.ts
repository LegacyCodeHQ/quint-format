import type Parser from "tree-sitter";
import type { TypeCheckContext } from "./type-check-context.js";

export function checkRecordType(node: Parser.SyntaxNode, context: TypeCheckContext): boolean {
  if (node.type !== "record_type") return false;

  const { source, lines, filePath, diagnostics } = context;
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
    return true;
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
  if (isExpanded) {
    for (const [index, field] of fields.entries()) {
      const nextField = fields[index + 1];
      const boundary = nextField ?? row ?? closeBrace;
      const comma = commas.find(
        (candidate) =>
          candidate.startIndex >= field.endIndex && candidate.startIndex < boundary.startIndex,
      );
      if (!comma || source.slice(field.endIndex, comma.startIndex) !== "") {
        const row = field.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: field.endPosition.column + 1,
          length: 1,
          rule: "format/multiline-record-separator",
          message: "expected a trailing comma after each record field",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }
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
    context.check(fieldType);
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
  return true;
}
