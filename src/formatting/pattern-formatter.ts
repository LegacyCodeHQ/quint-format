import type Parser from "tree-sitter";
import { commentDocument } from "./comments.js";
import { concat, type Doc, hardLine, indent, text } from "./document.js";

export function formatPattern(node: Parser.SyntaxNode): string {
  if (node.type === "identifier" || node.type === "hole") {
    return node.text;
  }
  if (node.type === "tuple_pattern") {
    return `(${node.childrenForFieldName("element").map(formatPattern).join(", ")})`;
  }
  if (node.type === "record_pattern") {
    return `{ ${node.childrenForFieldName("field").map(formatPattern).join(", ")} }`;
  }
  if (node.type === "qualified_identifier") {
    const namespace = node.childForFieldName("namespace");
    const names = node.childrenForFieldName("name");
    if (!namespace || names.length === 0) {
      throw new Error("Unable to locate the qualified pattern name");
    }
    return [namespace.text, ...names.map((name) => name.text)].join("::");
  }
  throw new Error("Formatting this binding pattern is not implemented yet");
}

export function formatCommentedTuplePattern(node: Parser.SyntaxNode): Doc {
  const elements = node.childrenForFieldName("element");
  const entries = node.namedChildren.map((child) => {
    if (child.type === "comment" || child.type === "documentation_comment") {
      return commentDocument(child);
    }
    const index = elements.findIndex((element) => element.id === child.id);
    if (index < 0) throw new Error("Formatting this tuple pattern content is not implemented yet");
    return text(`${formatPattern(child)}${index < elements.length - 1 ? "," : ""}`);
  });
  return concat([
    text("("),
    indent(concat(entries.flatMap((entry) => [hardLine, entry]))),
    hardLine,
    text(")"),
  ]);
}
