import type Parser from "tree-sitter";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
import { commentDocument } from "./comments.js";
import { concat, type Doc, hardLine, indent, text } from "./document.js";

export function indentBy(document: Doc, levels: number): Doc {
  let indented = document;
  for (let level = 0; level < levels; level += 1) indented = indent(indented);
  return indented;
}

export function definitionBodyContinuationIndentation(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  commentAttachments?: CommentAttachmentIndex,
): number {
  const equals = definition.children.find((child) => child.type === "=");
  if (!equals || body.startPosition.row <= equals.endPosition.row) return 1;

  const isCallExpression = body.type === "call_expression" || body.type === "ufcs_call_expression";
  const isSingleLineExpression =
    body.startPosition.row === body.endPosition.row &&
    preservesDefinitionBodyLineBreak(definition, body, commentAttachments);
  return isCallExpression || isSingleLineExpression ? 2 : 1;
}

export function definitionBodyDocument(
  head: string | Doc,
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  bodyDocument: Doc,
  minimumContinuationIndentation = 1,
  commentAttachments?: CommentAttachmentIndex,
): Doc {
  const headDocument = typeof head === "string" ? text(head) : head;
  const equals = definition.children.find((child) => child.type === "=");
  const comments = equals
    ? (commentAttachments?.commentsBetween(definition, equals.endIndex, body.startIndex) ?? [])
    : [];
  const firstContinuationNode = comments[0] ?? body;
  const continuationIndentation = Math.max(
    minimumContinuationIndentation,
    equals &&
      firstContinuationNode.startPosition.row > equals.endPosition.row &&
      firstContinuationNode.startPosition.column - definition.startPosition.column >= 4
      ? 2
      : 1,
  );
  const equalsLineComment =
    equals && comments[0]?.startPosition.row === equals.endPosition.row ? comments[0] : undefined;
  if (comments.length === 0) {
    return preservesDefinitionBodyLineBreak(definition, body, commentAttachments)
      ? concat([headDocument, indentBy(concat([hardLine, bodyDocument]), continuationIndentation)])
      : concat([headDocument, text(" "), bodyDocument]);
  }
  if (equalsLineComment) {
    return concat([
      headDocument,
      text(" "),
      commentDocument(equalsLineComment),
      indentBy(
        concat([
          ...comments.slice(1).flatMap((comment) => [hardLine, commentDocument(comment)]),
          hardLine,
          bodyDocument,
        ]),
        continuationIndentation,
      ),
    ]);
  }
  return concat([
    headDocument,
    indentBy(
      concat([
        ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
        hardLine,
        bodyDocument,
      ]),
      continuationIndentation,
    ),
  ]);
}

export function preservesDefinitionBodyLineBreak(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  commentAttachments?: CommentAttachmentIndex,
): boolean {
  const equals = definition.children.find((child) => child.type === "=");
  const hasBodyComments = Boolean(
    equals &&
      commentAttachments?.commentsBetween(definition, equals.endIndex, body.startIndex).length,
  );
  return Boolean(equals && !hasBodyComments && body.startPosition.row > equals.endPosition.row);
}
