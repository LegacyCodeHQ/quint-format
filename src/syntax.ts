import type Parser from "tree-sitter";

export function isCompactNondetSequence(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
): boolean {
  return (
    definition.childForFieldName("qualifier")?.type === "nondet" &&
    definition.endPosition.row === body.startPosition.row
  );
}
