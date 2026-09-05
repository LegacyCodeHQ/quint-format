import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "./diagnostics.js";

export interface TypeCheckContext {
  source: string;
  lines: string[];
  filePath: string;
  diagnostics: FormatDiagnostic[];
  check(node: Parser.SyntaxNode): void;
}
