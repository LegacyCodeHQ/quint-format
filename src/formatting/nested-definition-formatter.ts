import type Parser from "tree-sitter";
import { definitionBody } from "@/parsing/syntax.js";

export function requiresNestedDefinitionResultGap(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  hasLeadingBodyComments: boolean,
): boolean {
  const value = definitionBody(definition);
  return Boolean(
    !hasLeadingBodyComments &&
      body.type !== "nested_definition_expression" &&
      value &&
      value.endPosition.row > definition.startPosition.row,
  );
}
