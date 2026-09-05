import type Parser from "tree-sitter";
import type { TypeCheckContext } from "./type-check-context.js";

export function checkFunctionType(node: Parser.SyntaxNode, context: TypeCheckContext): boolean {
  if (node.type !== "function_type") return false;

  const { source, lines, filePath, diagnostics } = context;
  const parameter = node.childForFieldName("parameter");
  const result = node.childForFieldName("result");
  const arrow = node.children.find((child) => child.type === "->");
  if (!parameter || !result || !arrow) {
    throw new Error("Unable to locate the function type operator");
  }
  const beforeArrow = source.slice(parameter.endIndex, arrow.startIndex);
  const afterArrow = source.slice(arrow.endIndex, result.startIndex);
  if (beforeArrow !== " " || afterArrow !== " ") {
    const row = arrow.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: arrow.startPosition.column + 1,
      length: 2,
      rule: "format/type-operator-spacing",
      message: "expected one space around '->'",
      sourceLine: lines[row] ?? "",
    });
  }
  context.check(parameter);
  context.check(result);
  return true;
}
