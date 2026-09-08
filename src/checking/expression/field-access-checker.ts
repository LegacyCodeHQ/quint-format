import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import { isCommentNode } from "@/parsing/comment-attachments.js";
import {
  collectNodes,
  isMultilineUfcsContinuation,
  postfixContinuationIndentation,
  postfixExpressionTarget,
  ufcsChainRoot,
} from "@/parsing/syntax.js";

export function checkFieldAccessExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  const accesses = [
    ...collectNodes(root, "field_access_expression"),
    ...collectNodes(root, "ufcs_call_expression"),
  ];
  for (const fieldAccess of accesses) {
    const target = postfixExpressionTarget(fieldAccess);
    if (!target) {
      throw new Error("Unable to locate the field access operator");
    }
    const { receiver: object, member: field, dot } = target;
    const beforeDot = source.slice(object.endIndex, dot.startIndex);
    const afterDot = source.slice(dot.endIndex, field.startIndex);
    const isMultilineContinuation = isMultilineUfcsContinuation(fieldAccess);
    const continuationIndentation = postfixContinuationIndentation(object);
    const hasCanonicalBeforeDot = isMultilineContinuation
      ? /^(?:(?:\r\n|\r|\n)[\t ]*){1,2}$/.test(beforeDot)
      : beforeDot === "";
    const comments = fieldAccess.namedChildren.filter(
      (child) =>
        isCommentNode(child) &&
        child.startIndex >= object.endIndex &&
        child.endIndex <= field.startIndex,
    );
    const hasComments = comments.length > 0;
    if ((!hasComments && !hasCanonicalBeforeDot) || afterDot !== "") {
      const row = dot.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: dot.startPosition.column + 1,
        length: 1,
        rule: "format/field-access-spacing",
        message: "expected no space around '.'",
        sourceLine: lines[row] ?? "",
      });
    }
    if (
      isMultilineContinuation &&
      !hasComments &&
      dot.startPosition.column !==
        (lines[ufcsChainRoot(fieldAccess).startPosition.row]?.search(/\S|$/) ?? 0) +
          continuationIndentation * 2
    ) {
      const row = dot.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, dot.startPosition.column),
        rule: "format/field-access-indentation",
        message:
          continuationIndentation === 0
            ? "expected the selector aligned with its multiline receiver"
            : "expected a four-space continuation indent",
        sourceLine: lines[row] ?? "",
      });
    }
    if (hasComments && dot.startPosition.row > object.endPosition.row) {
      const expectedColumn =
        (lines[ufcsChainRoot(fieldAccess).startPosition.row]?.search(/\S|$/) ?? 0) +
        continuationIndentation * 2;
      for (const continuation of [...comments, dot]) {
        if (continuation.startPosition.column === expectedColumn) continue;
        const row = continuation.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, continuation.startPosition.column),
          rule: "format/field-access-indentation",
          message:
            continuationIndentation === 0
              ? "expected the chain comment and selector aligned with the multiline receiver"
              : "expected the chain comment and selector at a four-space continuation",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }

  return diagnostics;
}
