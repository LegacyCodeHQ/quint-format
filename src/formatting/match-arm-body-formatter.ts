import type Parser from "tree-sitter";
import { isBlockCombinatorExpression } from "@/parsing/syntax.js";

export function isStructuralMatchArmBody(body: Parser.SyntaxNode): boolean {
  return (
    isBlockCombinatorExpression(body) ||
    body.type === "match_expression" ||
    body.type === "record_literal" ||
    body.type === "block_expression"
  );
}

export function matchArmBodyIndentation(body: Parser.SyntaxNode): number {
  return isStructuralMatchArmBody(body) && body.type !== "match_expression" ? 1 : 2;
}
