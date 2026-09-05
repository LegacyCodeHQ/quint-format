import type Parser from "tree-sitter";
import type { TypeCheckContext } from "./type-check-context.js";

export function checkOperatorType(node: Parser.SyntaxNode, context: TypeCheckContext): boolean {
  if (node.type !== "operator_type") return false;

  const { source, lines, filePath, diagnostics } = context;
  const parameters = node.childrenForFieldName("parameter");
  const result = node.childForFieldName("result");
  const arrow = node.children.find((child) => child.type === "=>");
  const openParen = node.children.find((child) => child.type === "(");
  const closeParen = node.children.find((child) => child.type === ")");
  if (!result || !arrow) {
    throw new Error("Unable to locate the operator type result");
  }

  if (openParen && closeParen && parameters.length > 0) {
    const firstParameter = parameters[0];
    const lastParameter = parameters.at(-1);
    if (!firstParameter || !lastParameter) {
      throw new Error("Unable to locate the operator parameters");
    }
    const afterOpenParen = source.slice(openParen.endIndex, firstParameter.startIndex);
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

    const commas = node.children.filter((child) => child.type === ",");
    for (const [index, comma] of commas.entries()) {
      const previousParameter = parameters[index];
      const nextParameter = parameters[index + 1];
      if (!previousParameter || !nextParameter) {
        throw new Error("Unable to locate operator parameter types around ','");
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
          rule: "format/type-separator-spacing",
          message: "expected ', ' between types",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    const beforeCloseParen = source.slice(lastParameter.endIndex, closeParen.startIndex);
    if (beforeCloseParen !== "") {
      const row = closeParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: lastParameter.endPosition.column + 1,
        length: Math.max(1, beforeCloseParen.length),
        rule: "format/type-delimiter-spacing",
        message: "expected no space before ')'",
        sourceLine: lines[row] ?? "",
      });
    }
  } else if (openParen && closeParen) {
    const insideParentheses = source.slice(openParen.endIndex, closeParen.startIndex);
    if (insideParentheses !== "") {
      const row = openParen.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.endPosition.column + 1,
        length: Math.max(1, insideParentheses.length),
        rule: "format/type-delimiter-spacing",
        message: "expected no space inside '()'",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const arrowAnchor = closeParen ?? parameters.at(-1);
  if (!arrowAnchor) {
    throw new Error("Unable to locate the operator arrow anchor");
  }
  const beforeArrow = source.slice(arrowAnchor.endIndex, arrow.startIndex);
  const afterArrow = source.slice(arrow.endIndex, result.startIndex);
  if (beforeArrow !== " " || afterArrow !== " ") {
    const row = arrow.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: arrow.startPosition.column + 1,
      length: 2,
      rule: "format/type-operator-spacing",
      message: "expected one space around '=>'",
      sourceLine: lines[row] ?? "",
    });
  }
  for (const parameter of parameters) context.check(parameter);
  context.check(result);
  return true;
}
