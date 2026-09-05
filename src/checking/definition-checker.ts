import type { ModuleDeclaration } from "../core/analysis.js";
import type { FormatDiagnostic } from "../core/diagnostics.js";
import { preservesDefinitionBodyLineBreak } from "../parsing/syntax.js";

export function checkDefinitionBody(
  declaration: ModuleDeclaration,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  if (!declaration.equals || !declaration.valueNode) return [];

  const diagnostics: FormatDiagnostic[] = [];
  const equalsAnchor =
    declaration.typeNode ??
    declaration.closeParen ??
    declaration.typeCloseBracket ??
    declaration.nameNode;
  const beforeEquals = source.slice(equalsAnchor.endIndex, declaration.equals.startIndex);
  const afterEquals = source.slice(declaration.equals.endIndex, declaration.valueNode.startIndex);
  const isMultilineSum =
    declaration.valueNode.type === "sum_type" &&
    declaration.valueNode.startPosition.row < declaration.valueNode.endPosition.row;
  const requiresLineBreakAfterEquals =
    isMultilineSum || preservesDefinitionBodyLineBreak(declaration.node, declaration.valueNode);
  const hasCanonicalAfterEquals = requiresLineBreakAfterEquals
    ? /^(?:\r\n|\r|\n)[\t ]*$/.test(afterEquals)
    : afterEquals === " ";
  if (beforeEquals !== " " || !hasCanonicalAfterEquals) {
    const row = declaration.equals.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.equals.startPosition.column + 1,
      length: 1,
      rule: "format/equals-spacing",
      message: requiresLineBreakAfterEquals
        ? "expected a line break after '='"
        : "expected one space around '='",
      sourceLine: lines[row] ?? "",
    });
  }
  if (
    declaration.node.type === "assumption_declaration" &&
    declaration.valueNode.startPosition.row > declaration.equals.endPosition.row &&
    declaration.valueNode.startPosition.column !== declaration.node.startPosition.column + 4
  ) {
    const row = declaration.valueNode.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: 1,
      length: Math.max(1, declaration.valueNode.startPosition.column),
      rule: "format/definition-body-indentation",
      message: "expected a four-space continuation indent",
      sourceLine: lines[row] ?? "",
    });
  }

  return diagnostics;
}
