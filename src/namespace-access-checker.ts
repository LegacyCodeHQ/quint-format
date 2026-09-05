import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "./diagnostics.js";
import { collectNodes } from "./syntax.js";

export function checkNamespaceAccess(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  const namespaceNodes = [
    ...collectNodes(root, "qualified_identifier"),
    ...collectNodes(root, "namespace_access_expression"),
  ];
  for (const namespaceNode of namespaceNodes) {
    const names = namespaceNode.namedChildren;
    const separators = namespaceNode.children.filter((child) => child.type === "::");
    for (const [index, separator] of separators.entries()) {
      const previous = names[index];
      const next = names[index + 1];
      if (!previous || !next) throw new Error("Unable to locate names around '::'");
      if (
        source.slice(previous.endIndex, separator.startIndex) !== "" ||
        source.slice(separator.endIndex, next.startIndex) !== ""
      ) {
        const row = separator.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: separator.startPosition.column + 1,
          length: 2,
          rule: "format/namespace-access-spacing",
          message: "expected no space around '::'",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }
  return diagnostics;
}
