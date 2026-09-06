import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
import {
  collectNodes,
  compactNestedBlockExpression,
  definitionBody,
  isCompactNondetSequence,
} from "@/parsing/syntax.js";
import { checkLocalDefinition } from "./local-definition-checker.js";

export function checkNestedDefinitions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
  commentAttachments: CommentAttachmentIndex,
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const nested of collectNodes(root, "nested_definition_expression")) {
    const definition = nested.childForFieldName("definition");
    const body = nested.childForFieldName("body");
    if (!definition || !body) throw new Error("Unable to locate the nested definition layout");
    checkLocalDefinition(definition, source, lines, filePath, diagnostics);
    const definitionValue = definitionBody(definition);
    const leadingBodyComments = nested.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= definition.endIndex &&
        child.endIndex <= body.startIndex &&
        child.startPosition.row !== definitionValue?.endPosition.row,
    );
    const firstLeadingBodyComment = leadingBodyComments[0];
    if (
      definitionValue &&
      firstLeadingBodyComment &&
      leadingBodyComments.length > 1 &&
      definitionValue.startPosition.row < definitionValue.endPosition.row &&
      firstLeadingBodyComment.startPosition.row - definitionValue.endPosition.row !== 2
    ) {
      const row = firstLeadingBodyComment.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: firstLeadingBodyComment.startPosition.column + 1,
        length: 2,
        rule: "format/nested-definition-comment-separation",
        message: "expected one blank line after the multiline local definition",
        sourceLine: lines[row] ?? "",
      });
    }
    const preservesCompactNondetSequence = isCompactNondetSequence(definition, body);
    const hasCanonicalCompactGap =
      preservesCompactNondetSequence && source.slice(definition.endIndex, body.startIndex) === " ";
    if (preservesCompactNondetSequence && !hasCanonicalCompactGap) {
      const row = body.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: body.startPosition.column + 1,
        length: Math.max(1, body.text.length),
        rule: "format/nested-definition-layout",
        message: "expected one space after the compact nondet definition",
        sourceLine: lines[row] ?? "",
      });
    } else if (
      body.startPosition.row <= definition.endPosition.row &&
      !compactNestedBlockExpression(definition, body, commentAttachments) &&
      !preservesCompactNondetSequence
    ) {
      const row = body.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: body.startPosition.column + 1,
        length: Math.max(1, body.text.length),
        rule: "format/nested-definition-layout",
        message: "expected the nested definition body on a new line",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
