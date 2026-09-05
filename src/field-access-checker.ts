import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "./diagnostics.js";
import {
  collectNodes,
  isMultilineUfcsContinuation,
  ufcsChainRoot,
  ufcsContinuationIndentation,
} from "./syntax.js";

export function checkFieldAccessExpressions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const fieldAccess of collectNodes(root, "field_access_expression")) {
    const object = fieldAccess.childForFieldName("object");
    const field = fieldAccess.childForFieldName("field");
    const dot = fieldAccess.children.find((child) => child.type === ".");
    if (!object || !field || !dot) {
      throw new Error("Unable to locate the field access operator");
    }
    const beforeDot = source.slice(object.endIndex, dot.startIndex);
    const afterDot = source.slice(dot.endIndex, field.startIndex);
    const isMultilineContinuation = isMultilineUfcsContinuation(fieldAccess);
    const hasCanonicalBeforeDot = isMultilineContinuation
      ? /^(?:\r\n|\r|\n)[\t ]*$/.test(beforeDot)
      : beforeDot === "";
    const comments = fieldAccess.namedChildren.filter(
      (child) => child.type === "comment" || child.type === "documentation_comment",
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
          ufcsContinuationIndentation() * 2
    ) {
      const row = dot.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, dot.startPosition.column),
        rule: "format/field-access-indentation",
        message: "expected a four-space continuation indent",
        sourceLine: lines[row] ?? "",
      });
    }
    if (hasComments && dot.startPosition.row > object.endPosition.row) {
      const expectedColumn =
        (lines[ufcsChainRoot(fieldAccess).startPosition.row]?.search(/\S|$/) ?? 0) +
        ufcsContinuationIndentation() * 2;
      for (const continuation of [...comments, dot]) {
        if (continuation.startPosition.column === expectedColumn) continue;
        const row = continuation.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, continuation.startPosition.column),
          rule: "format/field-access-indentation",
          message: "expected the chain comment and selector at a four-space continuation",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }

  return diagnostics;
}
