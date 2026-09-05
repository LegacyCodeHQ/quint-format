import { readFileSync } from "node:fs";
import { checkQuint, type FormatDiagnostic, QuintSyntaxError, renderDiagnostic } from "@/index.js";

export interface FixtureCheckResult {
  kind: "clean" | "format" | "syntax";
  diagnostics: FormatDiagnostic[];
  rendered: string;
}

export function checkFixture(name: string): FixtureCheckResult {
  const filePath = `test/fixtures/${name}`;
  const source = readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

  return checkSource(source, filePath);
}

export function checkSource(source: string, filePath: string): FixtureCheckResult {
  try {
    const diagnostics = checkQuint(source, filePath);
    return {
      kind: diagnostics.length === 0 ? "clean" : "format",
      diagnostics,
      rendered: diagnostics.map(renderDiagnostic).join(""),
    };
  } catch (error) {
    if (!(error instanceof QuintSyntaxError)) throw error;
    const diagnostics = error.diagnostics.map((diagnostic) => ({ filePath, ...diagnostic }));
    return {
      kind: "syntax",
      diagnostics,
      rendered: diagnostics.map(renderDiagnostic).join(""),
    };
  }
}
