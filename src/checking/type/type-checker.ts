import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "../../core/diagnostics.js";
import { checkFunctionType } from "./function-type-checker.js";
import { checkOperatorType } from "./operator-type-checker.js";
import { checkParameterizedType } from "./parameterized-type-checker.js";
import { checkParenthesizedType } from "./parenthesized-type-checker.js";
import { checkRecordType } from "./record-type-checker.js";
import { checkSumType } from "./sum-type-checker.js";
import type { TypeCheckContext } from "./type-check-context.js";
import { checkUnitType } from "./unit-type-checker.js";

export function checkTypeDelimiterSpacing(
  node: Parser.SyntaxNode,
  source: string,
  lines: string[],
  filePath: string,
  diagnostics: FormatDiagnostic[],
) {
  const context: TypeCheckContext = {
    source,
    lines,
    filePath,
    diagnostics,
    check: (child) => checkTypeDelimiterSpacing(child, source, lines, filePath, diagnostics),
  };
  if (checkUnitType(node, context)) return;
  if (checkSumType(node, context)) return;
  if (checkParenthesizedType(node, context)) return;
  if (checkOperatorType(node, context)) return;
  if (checkFunctionType(node, context)) return;
  if (checkRecordType(node, context)) return;
  checkParameterizedType(node, context);
}
