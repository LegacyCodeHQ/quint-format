import type Parser from "tree-sitter";
import { definitionBody, isBlockCombinatorExpression } from "@/parsing/syntax.js";

function isBlockCombinatorEntryDefinition(definition: Parser.SyntaxNode): boolean {
  let entry = definition.parent;
  if (entry?.type !== "nested_definition_expression") return false;
  while (entry.parent?.type === "nested_definition_expression") entry = entry.parent;
  return Boolean(entry.parent && isBlockCombinatorExpression(entry.parent));
}

export function requiresNestedDefinitionResultGap(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  hasLeadingBodyComments: boolean,
): boolean {
  const value = definitionBody(definition);
  return Boolean(
    !hasLeadingBodyComments &&
      body.type !== "nested_definition_expression" &&
      !isBlockCombinatorEntryDefinition(definition) &&
      value &&
      value.endPosition.row > definition.startPosition.row,
  );
}
