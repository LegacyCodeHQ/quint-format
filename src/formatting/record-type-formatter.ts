import type Parser from "tree-sitter";
import { isCommentNode } from "@/parsing/comment-attachments.js";
import { commentDocument } from "./comments.js";
import { concat, type Doc, hardLine, indent, text } from "./document.js";
import { formatType } from "./type-formatter.js";

export function formatExpandedRecordType(node: Parser.SyntaxNode): Doc {
  const row = node.childForFieldName("row");
  const fields = node.namedChildren.filter((child) => child.type === "record_type_field");
  const lastField = fields.at(-1);
  const hasTrailingComma = node.children.some(
    (child) =>
      !row && child.type === "," && Boolean(lastField && child.startIndex >= lastField.endIndex),
  );
  const entries: Doc[] = [];
  let previousField: Parser.SyntaxNode | undefined;
  for (const child of node.namedChildren) {
    if (isCommentNode(child)) {
      const isTrailingFieldComment = previousField?.endPosition.row === child.startPosition.row;
      if (isTrailingFieldComment) {
        const fieldDocument = entries.pop();
        if (!fieldDocument) {
          throw new Error("Unable to attach the trailing record type field comment");
        }
        const comma = node.children.find(
          (candidate) =>
            candidate.type === "," &&
            candidate.startIndex >= (previousField?.endIndex ?? child.startIndex) &&
            candidate.endIndex <= child.startIndex,
        );
        const gapStart = comma?.endIndex ?? previousField?.endIndex ?? child.startIndex;
        const sourceCommentGap = node.text.slice(
          gapStart - node.startIndex,
          child.startIndex - node.startIndex,
        );
        const previousFieldHasFollowingFieldOrRow = node.namedChildren.some(
          (candidate) =>
            candidate.startIndex > child.endIndex &&
            (candidate.type === "record_type_field" || (row && candidate.id === row.id)),
        );
        const commentGap =
          comma && !previousFieldHasFollowingFieldOrRow ? ` ${sourceCommentGap}` : sourceCommentGap;
        entries.push(concat([fieldDocument, text(commentGap), commentDocument(child)]));
      } else {
        entries.push(commentDocument(child));
      }
      previousField = undefined;
      continue;
    }
    if (child.type === "record_type_field") {
      const name = child.childForFieldName("name");
      const fieldType = child.childForFieldName("type");
      if (!name || !fieldType) throw new Error("Unable to locate a commented record field type");
      const hasFollowingField = node.namedChildren.some(
        (candidate) =>
          candidate.startIndex > child.endIndex && candidate.type === "record_type_field",
      );
      entries.push(
        text(
          `${name.text}: ${formatType(fieldType)}${hasFollowingField || (child.id === lastField?.id && hasTrailingComma) ? "," : ""}`,
        ),
      );
      previousField = child;
      continue;
    }
    if (row && child.id === row.id) {
      entries.push(text(`| ${row.text}`));
      previousField = undefined;
      continue;
    }
    throw new Error("Formatting this commented record type syntax is not implemented yet");
  }
  return concat([
    text("{"),
    indent(concat(entries.flatMap((entry) => [hardLine, entry]))),
    hardLine,
    text("}"),
  ]);
}
