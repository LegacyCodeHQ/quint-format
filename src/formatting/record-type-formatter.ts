import type Parser from "tree-sitter";
import { commentDocument } from "./comments.js";
import { concat, type Doc, hardLine, indent, text } from "./document.js";
import { formatType } from "./type-formatter.js";

export function formatExpandedRecordType(node: Parser.SyntaxNode): Doc {
  const row = node.childForFieldName("row");
  const entries: Doc[] = [];
  let previousField: Parser.SyntaxNode | undefined;
  for (const child of node.namedChildren) {
    if (child.type === "comment" || child.type === "documentation_comment") {
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
        const commentGap = node.text.slice(
          gapStart - node.startIndex,
          child.startIndex - node.startIndex,
        );
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
      entries.push(text(`${name.text}: ${formatType(fieldType)},`));
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
