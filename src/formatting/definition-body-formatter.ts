import type Parser from "tree-sitter";
import { preservesDefinitionBodyLineBreak } from "@/parsing/syntax.js";
import { commentDocument } from "./comments.js";
import { concat, type Doc, hardLine, indent, text } from "./document.js";

export function indentBy(document: Doc, levels: number): Doc {
  let indented = document;
  for (let level = 0; level < levels; level += 1) indented = indent(indented);
  return indented;
}

export function definitionBodyDocument(
  head: string | Doc,
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  bodyDocument: Doc,
  minimumContinuationIndentation = 1,
): Doc {
  const headDocument = typeof head === "string" ? text(head) : head;
  const comments = definition.namedChildren.filter(
    (child) =>
      (child.type === "comment" || child.type === "documentation_comment") &&
      child.endIndex <= body.startIndex,
  );
  const equals = definition.children.find((child) => child.type === "=");
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
    return preservesDefinitionBodyLineBreak(definition, body)
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
