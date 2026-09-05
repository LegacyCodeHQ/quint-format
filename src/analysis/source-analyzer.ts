import type Parser from "tree-sitter";
import type { AnalyzedSource } from "@/core/analysis.js";
import { parseQuint } from "@/parsing/parser.js";
import { analyzeModuleNode } from "./module-analyzer.js";

export function analyzeSource(source: string): AnalyzedSource {
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
