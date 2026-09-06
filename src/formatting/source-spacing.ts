import type Parser from "tree-sitter";
import { commentDocument } from "./comments.js";
import { type Doc, hardLine } from "./document.js";

export function preservedLineBreaksBetween(
  previous: Parser.SyntaxNode,
  next: Parser.SyntaxNode,
): Doc[] {
  const lineBreaks = Math.min(2, Math.max(1, next.startPosition.row - previous.endPosition.row));
  return Array.from({ length: lineBreaks }, () => hardLine);
}

export function preservedContinuationPrefix(
  receiver: Parser.SyntaxNode,
  comments: Parser.SyntaxNode[],
  selector: Parser.SyntaxNode,
): Doc[] {
  let previous = receiver;
  const documents = comments.flatMap((comment) => {
    const commentDocuments = [
      ...preservedLineBreaksBetween(previous, comment),
      commentDocument(comment),
    ];
    previous = comment;
    return commentDocuments;
  });
  return [...documents, ...preservedLineBreaksBetween(previous, selector)];
}
