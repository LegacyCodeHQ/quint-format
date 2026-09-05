import type Parser from "tree-sitter";
import type { AnalyzedSource } from "./analysis.js";
import { checkAnalyzedSource } from "./checker.js";
import type { FormatDiagnostic } from "./diagnostics.js";
import { analyzeModuleNode } from "./module-analyzer.js";
import { parseQuint } from "./parser.js";
import { renderSource } from "./source-renderer.js";

export { type FormatDiagnostic, renderDiagnostic } from "./diagnostics.js";
export { QuintSyntaxError } from "./parser.js";

function analyzeSource(source: string): AnalyzedSource {
  const root = parseQuint(source);
  let hashbang: Parser.SyntaxNode | undefined;
  let pendingComments: Parser.SyntaxNode[] = [];
  const modules: AnalyzedSource["modules"] = [];

  for (const node of root.namedChildren) {
    if (
      node.type === "hashbang" &&
      !hashbang &&
      modules.length === 0 &&
      pendingComments.length === 0
    ) {
      hashbang = node;
      continue;
    }

    if (node.type === "documentation_comment" || node.type === "comment") {
      pendingComments.push(node);
      continue;
    }

    if (node.type === "module_definition") {
      modules.push({ ...analyzeModuleNode(node), leadingComments: pendingComments });
      pendingComments = [];
      continue;
    }

    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  if (modules.length === 0) {
    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  return { hashbang, modules, trailingComments: pendingComments };
}

export function formatQuint(source: string): string {
  return renderSource(analyzeSource(source));
}

export function checkQuint(source: string, filePath: string): FormatDiagnostic[] {
  const analyzedSource = analyzeSource(source);
  const formatted = renderSource(analyzedSource);
  return checkAnalyzedSource(analyzedSource, source, formatted, filePath);
}
