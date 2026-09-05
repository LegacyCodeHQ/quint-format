import { analyzeSource } from "./analysis/source-analyzer.js";
import { checkAnalyzedSource } from "./checking/checker.js";
import type { FormatDiagnostic } from "./diagnostics.js";
import { renderSource } from "./source-renderer.js";

export { type FormatDiagnostic, renderDiagnostic } from "./diagnostics.js";
export { QuintSyntaxError } from "./parser.js";

export function formatQuint(source: string): string {
  return renderSource(analyzeSource(source));
}

export function checkQuint(source: string, filePath: string): FormatDiagnostic[] {
  const analyzedSource = analyzeSource(source);
  const formatted = renderSource(analyzedSource);
  return checkAnalyzedSource(analyzedSource, source, formatted, filePath);
}
