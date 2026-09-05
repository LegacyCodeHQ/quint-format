import type { AnalyzedSource } from "../core/analysis.js";
import type { FormatDiagnostic } from "../core/diagnostics.js";
import { checkDeclarationLayout } from "./declaration-checker.js";
import { checkDefinitionBody } from "./definition-checker.js";
import { checkAssignments } from "./expression/assignment-checker.js";
import { checkBinaryExpressions } from "./expression/binary-expression-checker.js";
import { checkBlockCombinators } from "./expression/block-combinator-checker.js";
import { checkBlockExpressions } from "./expression/block-expression-checker.js";
import { checkCallExpressions } from "./expression/call-expression-checker.js";
import { checkConditionalExpressions } from "./expression/conditional-expression-checker.js";
import { checkFieldAccessExpressions } from "./expression/field-access-checker.js";
import { checkIndexExpressions } from "./expression/index-expression-checker.js";
import { checkLambdaExpressions } from "./expression/lambda-expression-checker.js";
import { checkMatchExpressions } from "./expression/match-expression-checker.js";
import { checkNamespaceAccess } from "./expression/namespace-access-checker.js";
import { checkNestedDefinitions } from "./expression/nested-definition-checker.js";
import { checkNondetBindings } from "./expression/nondet-binding-checker.js";
import { checkPatternSpacing } from "./expression/pattern-checker.js";
import { checkRecordLiterals } from "./expression/record-literal-checker.js";
import { checkSequenceLiterals } from "./expression/sequence-literal-checker.js";
import { checkUnaryExpressions } from "./expression/unary-expression-checker.js";
import { checkUnitLiterals } from "./expression/unit-literal-checker.js";
import { checkFinalNewline } from "./final-newline-checker.js";
import { checkImportSpacing } from "./import-checker.js";
import { checkModuleLayout } from "./module-checker.js";
import { checkModuleInstance } from "./module-instance-checker.js";
import { checkParameterList } from "./parameter-list-checker.js";
import { checkOptionalSemicolon } from "./semicolon-checker.js";
import {
  checkCommentTrailingWhitespace,
  checkTrailingSourceComments,
} from "./source-comment-checker.js";
import { checkTypeDelimiterSpacing } from "./type/type-checker.js";
import { checkTypeAnnotations } from "./type-annotation-checker.js";
import { checkTypeParameters } from "./type-parameter-checker.js";

export function checkAnalyzedSource(
  analyzedSource: AnalyzedSource,
  source: string,
  formatted: string,
  filePath: string,
): FormatDiagnostic[] {
  if (source === formatted) return [];

  const diagnostics: FormatDiagnostic[] = [];
  const lines = source.split(/\r?\n/);
  diagnostics.push(...checkCommentTrailingWhitespace(analyzedSource, filePath, lines));
  for (const [moduleIndex, module] of analyzedSource.modules.entries()) {
    const previousModule = moduleIndex > 0 ? analyzedSource.modules[moduleIndex - 1] : undefined;
    diagnostics.push(...checkModuleLayout(module, previousModule, source, filePath, lines));

    for (const [index, declaration] of module.declarations.entries()) {
      const previousDeclaration = index > 0 ? module.declarations[index - 1] : undefined;
      diagnostics.push(
        ...checkDeclarationLayout(declaration, previousDeclaration, source, filePath, lines),
      );
      diagnostics.push(...checkImportSpacing(declaration, source, filePath, lines));
      diagnostics.push(...checkModuleInstance(declaration, source, filePath, lines));
      diagnostics.push(...checkTypeParameters(declaration, source, filePath, lines));
      diagnostics.push(...checkTypeAnnotations(declaration, source, filePath, lines));

      for (const typeRoot of declaration.typeRoots ?? []) {
        checkTypeDelimiterSpacing(typeRoot, source, lines, filePath, diagnostics);
      }

      checkPatternSpacing(declaration.nameNode, source, lines, filePath, diagnostics);
      diagnostics.push(...checkParameterList(declaration, source, filePath, lines));
      diagnostics.push(...checkDefinitionBody(declaration, source, filePath, lines));
      diagnostics.push(...checkOptionalSemicolon(declaration, filePath, lines));
      diagnostics.push(
        ...checkBinaryExpressions(declaration.binaryOperators ?? [], source, filePath, lines),
      );
      diagnostics.push(
        ...checkUnitLiterals(declaration.unitLiterals ?? [], source, filePath, lines),
      );
      diagnostics.push(
        ...checkSequenceLiterals(declaration.sequenceLiterals ?? [], source, filePath, lines),
      );
      diagnostics.push(
        ...checkCallExpressions(declaration.callExpressions ?? [], source, filePath, lines),
      );

      if (declaration.valueNode) {
        diagnostics.push(...checkIndexExpressions(declaration.valueNode, source, filePath, lines));
        diagnostics.push(
          ...checkFieldAccessExpressions(declaration.valueNode, source, filePath, lines),
        );
        diagnostics.push(...checkUnaryExpressions(declaration.valueNode, source, filePath, lines));
        diagnostics.push(...checkLambdaExpressions(declaration.valueNode, source, filePath, lines));
        diagnostics.push(
          ...checkConditionalExpressions(declaration.valueNode, source, filePath, lines),
        );
        diagnostics.push(...checkMatchExpressions(declaration.valueNode, source, filePath, lines));
        diagnostics.push(...checkNamespaceAccess(declaration.valueNode, source, filePath, lines));
        diagnostics.push(...checkAssignments(declaration.valueNode, source, filePath, lines));
        diagnostics.push(...checkBlockExpressions(declaration.valueNode, filePath, lines));
        diagnostics.push(...checkNondetBindings(declaration.valueNode, source, filePath, lines));
        diagnostics.push(...checkNestedDefinitions(declaration.valueNode, source, filePath, lines));
        diagnostics.push(...checkBlockCombinators(declaration.valueNode, source, filePath, lines));
      }

      diagnostics.push(
        ...checkRecordLiterals(declaration.recordLiterals ?? [], source, filePath, lines),
      );
    }
  }

  diagnostics.push(...checkTrailingSourceComments(analyzedSource, source, filePath, lines));
  diagnostics.push(...checkFinalNewline(source, filePath, lines));
  return diagnostics.sort((left, right) => left.line - right.line || left.column - right.column);
}
