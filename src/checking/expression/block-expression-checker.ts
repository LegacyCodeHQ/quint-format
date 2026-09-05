import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../diagnostics.js";
import {
  collectNodes,
  compactLambdaBlockExpression,
  compactNestedBlockExpression,
} from "../../parsing/syntax.js";

export function checkBlockExpressions(
  root: Parser.SyntaxNode,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const block of collectNodes(root, "block_expression")) {
    const openBrace = block.children.find((child) => child.type === "{");
    const closeBrace = block.children.find((child) => child.type === "}");
    const expression = block.childForFieldName("expression");
    const bindings = block.childrenForFieldName("binding");
    const firstContent = bindings[0] ?? expression;
    if (!openBrace || !closeBrace || !expression || !firstContent) {
      throw new Error("Unable to locate the block layout");
    }
    const contentNodes = [...bindings, expression];
    const rows = contentNodes.map((content) => content.startPosition.row);
    const nested = block.parent;
    const nestedDefinition =
      nested?.type === "nested_definition_expression"
        ? nested.childForFieldName("definition")
        : null;
    const isCompactNestedBlock = Boolean(
      nestedDefinition && compactNestedBlockExpression(nestedDefinition, block),
    );
    const parentLambda = block.parent?.type === "lambda_expression" ? block.parent : null;
    const isCompactLambdaBlock = Boolean(
      parentLambda && compactLambdaBlockExpression(parentLambda, block),
    );
    const hasCanonicalLines =
      isCompactNestedBlock ||
      isCompactLambdaBlock ||
      (rows[0] !== openBrace.startPosition.row &&
        rows.every((row, index) => index === 0 || row > (rows[index - 1] as number)) &&
        closeBrace.startPosition.row > (rows.at(-1) as number));
    if (!hasCanonicalLines) {
      const row = openBrace.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openBrace.startPosition.column + 1,
        length: 1,
        rule: "format/block-layout",
        message: "expected block contents and the closing brace on separate lines",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
