import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../core/diagnostics.js";
import {
  collectNodes,
  compactNestedBlockExpression,
  isCompactNondetSequence,
} from "../../parsing/syntax.js";
import { checkLocalDefinition } from "./local-definition-checker.js";

export function checkNestedDefinitions(
  root: Parser.SyntaxNode,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const nested of collectNodes(root, "nested_definition_expression")) {
    const definition = nested.childForFieldName("definition");
    const body = nested.childForFieldName("body");
    if (!definition || !body) throw new Error("Unable to locate the nested definition layout");
    checkLocalDefinition(definition, source, lines, filePath, diagnostics);
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
      !compactNestedBlockExpression(definition, body) &&
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
