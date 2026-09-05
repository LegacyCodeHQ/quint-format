import type Parser from "tree-sitter";
import type { TypeCheckContext } from "./type-check-context.js";

export function checkParenthesizedType(
  node: Parser.SyntaxNode,
  context: TypeCheckContext,
): boolean {
  if (node.type !== "parenthesized_type") return false;

  const { source, lines, filePath, diagnostics } = context;
  const openParen = node.children.find((child) => child.type === "(");
  const closeParen = node.children.find((child) => child.type === ")");
  const innerType = node.childForFieldName("type");
  if (!openParen || !closeParen || !innerType) {
    throw new Error("Unable to locate the parenthesized type delimiters");
  }
  const afterOpenParen = source.slice(openParen.endIndex, innerType.startIndex);
  if (afterOpenParen !== "") {
    const row = openParen.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: openParen.endPosition.column + 1,
      length: Math.max(1, afterOpenParen.length),
      rule: "format/type-delimiter-spacing",
      message: "expected no space after '('",
      sourceLine: lines[row] ?? "",
    });
  }
  context.check(innerType);
  const beforeCloseParen = source.slice(innerType.endIndex, closeParen.startIndex);
  if (beforeCloseParen !== "") {
    const row = closeParen.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: innerType.endPosition.column + 1,
      length: Math.max(1, beforeCloseParen.length),
      rule: "format/type-delimiter-spacing",
      message: "expected no space before ')'",
      sourceLine: lines[row] ?? "",
    });
  }
  return true;
}
