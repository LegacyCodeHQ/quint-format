import type Parser from "tree-sitter";
import type { TypeCheckContext } from "./type-check-context.js";

const parameterizedTypeNames = new Set(["set_type", "list_type", "type_application", "tuple_type"]);

export function checkParameterizedType(
  node: Parser.SyntaxNode,
  context: TypeCheckContext,
): boolean {
  if (!parameterizedTypeNames.has(node.type)) return false;

  const { source, lines, filePath, diagnostics } = context;
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

  for (const element of elements) context.check(element);
  return true;
}
