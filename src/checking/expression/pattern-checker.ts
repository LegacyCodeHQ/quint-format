import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../core/diagnostics.js";

export function checkPatternSpacing(
  node: Parser.SyntaxNode,
  source: string,
  lines: string[],
  filePath: string,
  diagnostics: FormatDiagnostic[],
) {
  if (node.type !== "tuple_pattern" && node.type !== "record_pattern") return;
  const isTuple = node.type === "tuple_pattern";
  const openType = isTuple ? "(" : "{";
  const closeType = isTuple ? ")" : "}";
  const openDelimiter = node.children.find((child) => child.type === openType);
  const closeDelimiter = node.children.find((child) => child.type === closeType);
  const elements = node.childrenForFieldName(isTuple ? "element" : "field");
  const commas = node.children.filter((child) => child.type === ",");
  const first = elements[0];
  const last = elements.at(-1);
  if (!openDelimiter || !closeDelimiter || !first || !last) {
    throw new Error(`Unable to locate the ${isTuple ? "tuple" : "record"} pattern delimiters`);
  }
  const expectedDelimiterSpace = isTuple ? "" : " ";
  const afterOpen = source.slice(openDelimiter.endIndex, first.startIndex);
  if (afterOpen !== expectedDelimiterSpace) {
    const row = openDelimiter.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: openDelimiter.endPosition.column + 1,
      length: Math.max(1, afterOpen.length),
      rule: "format/pattern-delimiter-spacing",
      message: `expected ${isTuple ? "no" : "one"} space after '${openType}'`,
      sourceLine: lines[row] ?? "",
    });
  }
  for (const [index, comma] of commas.entries()) {
    const previous = elements[index];
    const next = elements[index + 1];
    if (
      previous &&
      next &&
      (source.slice(previous.endIndex, comma.startIndex) !== "" ||
        source.slice(comma.endIndex, next.startIndex) !== " ")
    ) {
      const row = comma.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: comma.startPosition.column + 1,
        length: 1,
        rule: "format/pattern-separator-spacing",
        message: `expected ', ' between pattern ${isTuple ? "elements" : "fields"}`,
        sourceLine: lines[row] ?? "",
      });
    }
  }
  const beforeClose = source.slice(last.endIndex, closeDelimiter.startIndex);
  if (beforeClose !== expectedDelimiterSpace) {
    const row = closeDelimiter.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: last.endPosition.column + 1,
      length: Math.max(1, beforeClose.length),
      rule: "format/pattern-delimiter-spacing",
      message: `expected ${isTuple ? "no" : "one"} space before '${closeType}'`,
      sourceLine: lines[row] ?? "",
    });
  }
  for (const element of elements)
    checkPatternSpacing(element, source, lines, filePath, diagnostics);
}
