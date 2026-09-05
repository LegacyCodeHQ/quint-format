import type Parser from "tree-sitter";
import { concat, type Doc, hardLine, text } from "./document.js";

export function commentDocument(node: Parser.SyntaxNode): Doc {
  const continuationPrefix = " ".repeat(node.startPosition.column);
  const lines = node.text.split(/\r\n|\r|\n/).map((rawLine, index) => {
    const line = rawLine.replace(/[ \t]+$/u, "");
    if (index === 0 || continuationPrefix.length === 0) {
      return line;
    }

    return line.startsWith(continuationPrefix) ? line.slice(continuationPrefix.length) : line;
  });

  return concat(
    lines.flatMap((line, index) => (index === 0 ? [text(line)] : [hardLine, text(line)])),
  );
}

export function leadingCommentsDocument(
  comments: Parser.SyntaxNode[],
  declaration: Parser.SyntaxNode,
): Doc {
  return concat(
    comments.flatMap((comment, index) => {
      const next = comments[index + 1] ?? declaration;
      const lineBreaks = Math.max(1, next.startPosition.row - comment.endPosition.row);
      return [commentDocument(comment), ...Array.from({ length: lineBreaks }, () => hardLine)];
    }),
  );
}

export function preservesTrailingCommentAlignment(gap: string): boolean {
  return /^ {2,}$/.test(gap);
}
