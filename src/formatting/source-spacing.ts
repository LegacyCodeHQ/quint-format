import type Parser from "tree-sitter";
import { lineBreaksBetween } from "@/parsing/source-layout.js";
import { commentDocument } from "./comments.js";
import { type Doc, hardLine } from "./document.js";
import { maxPreservedLineBreaks } from "./policy.js";

export function preservedLineBreaksBetween(
  previous: Parser.SyntaxNode,
  next: Parser.SyntaxNode,
): Doc[] {
  const lineBreaks = Math.min(
    maxPreservedLineBreaks,
    Math.max(1, lineBreaksBetween(previous, next)),
  );
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
