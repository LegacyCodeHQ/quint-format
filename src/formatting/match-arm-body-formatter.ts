import type Parser from "tree-sitter";
import { isBlockCombinatorExpression } from "@/parsing/syntax.js";
import { continuationIndentLevels, structuralIndentLevels } from "./policy.js";

export function isStructuralMatchArmBody(body: Parser.SyntaxNode): boolean {
  return (
    isBlockCombinatorExpression(body) ||
    body.type === "match_expression" ||
    body.type === "record_literal" ||
    body.type === "block_expression"
  );
}

export function matchArmBodyIndentation(body: Parser.SyntaxNode): number {
  return isStructuralMatchArmBody(body) && body.type !== "match_expression"
    ? structuralIndentLevels
    : continuationIndentLevels;
}

export function preservesMatchArmBodyLineBreak(
  patternEnd: Parser.SyntaxNode,
  arrow: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
): boolean {
  return (
    body.startPosition.row > arrow.endPosition.row ||
    (body.type === "match_expression" &&
      body.startPosition.row < body.endPosition.row &&
      arrow.startPosition.row > patternEnd.endPosition.row)
  );
}
