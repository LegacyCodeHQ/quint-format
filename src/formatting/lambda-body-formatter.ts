import type Parser from "tree-sitter";
import { isBraceDelimitedLambdaBody } from "@/parsing/syntax.js";
import { indentWidth } from "./document.js";

export function lambdaBodyIndentation(body: Parser.SyntaxNode): number {
  return isBraceDelimitedLambdaBody(body) && body.type !== "match_expression" ? 1 : 2;
}

export function lambdaContinuationAnchor(lambda: Parser.SyntaxNode): Parser.SyntaxNode {
  let anchor = lambda;
  let ancestor = lambda.parent;

  while (ancestor) {
    if (
      ancestor.startPosition.row === lambda.startPosition.row &&
      ancestor.startPosition.column < anchor.startPosition.column &&
      ancestor.type !== "module_definition" &&
      ancestor.type !== "source_file"
    ) {
      anchor = ancestor;
    }
    ancestor = ancestor.parent;
  }

  return anchor;
}

export function lambdaBodyColumn(lambda: Parser.SyntaxNode, body: Parser.SyntaxNode): number {
  return (
    lambdaContinuationAnchor(lambda).startPosition.column +
    lambdaBodyIndentation(body) * indentWidth
  );
}
