import type Parser from "tree-sitter";
import type { TypeCheckContext } from "./type-check-context.js";

export function checkUnitType(node: Parser.SyntaxNode, context: TypeCheckContext): boolean {
  if (node.type !== "unit_type") return false;

  const openParen = node.children.find((child) => child.type === "(");
  const closeParen = node.children.find((child) => child.type === ")");
  if (!openParen || !closeParen) {
    throw new Error("Unable to locate the unit type delimiters");
  }
  const insideParentheses = context.source.slice(openParen.endIndex, closeParen.startIndex);
  if (insideParentheses !== "") {
    const row = openParen.endPosition.row;
    context.diagnostics.push({
      filePath: context.filePath,
      line: row + 1,
      column: openParen.endPosition.column + 1,
      length: Math.max(1, insideParentheses.length),
      rule: "format/type-delimiter-spacing",
      message: "expected no space inside '()'",
      sourceLine: context.lines[row] ?? "",
    });
  }
  return true;
}
