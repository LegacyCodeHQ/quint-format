import type Parser from "tree-sitter";
import type { ModuleDeclaration } from "@/core/analysis.js";
import type { SourceLayoutIndex } from "@/parsing/source-layout.js";
import { maxPreservedLineBreaks } from "./policy.js";

export type DeclarationSeparation = "leading-comment" | "multiline-definitions" | null;

export interface DeclarationBoundaryPlan {
  readonly previousEnd: Parser.SyntaxNode;
  readonly currentStart: Parser.SyntaxNode;
  readonly actualLineBreaks: number;
  readonly expectedLineBreaks: number;
  readonly separation: DeclarationSeparation;
  readonly requiresNormalization: boolean;
  readonly sharesLineWithPrevious: boolean;
}

function isDefinition(declaration: ModuleDeclaration): boolean {
  const type = declaration.node.type;
  return (
    type === "operator_definition" ||
    type === "value_definition" ||
    type === "type_alias_declaration" ||
    type === "uninterpreted_type_declaration"
  );
}

function isMultiline(declaration: ModuleDeclaration): boolean {
  return declaration.node.startPosition.row < declaration.node.endPosition.row;
}

export function separatesDefinitions(
  previous: ModuleDeclaration,
  current: ModuleDeclaration,
): boolean {
  if (!isDefinition(previous) || !isDefinition(current)) return false;

  return isMultiline(previous) && isMultiline(current);
}

export function groupsCommentedAssumptions(
  previous: ModuleDeclaration,
  current: ModuleDeclaration,
): boolean {
  return (
    previous.node.type === "assumption_declaration" &&
    current.node.type === "assumption_declaration"
  );
}

export function planDeclarationBoundary(
  previous: ModuleDeclaration,
  current: ModuleDeclaration,
  sourceLayout: SourceLayoutIndex,
): DeclarationBoundaryPlan {
  const previousEnd = previous.trailingComments?.at(-1) ?? previous.node;
  const currentStart = current.leadingComments?.[0] ?? current.node;
  const groupsCommentedImports =
    previous.keyword.text === "import" && current.keyword.text === "import";
  const separatesLeadingComment = Boolean(
    current.leadingComments?.length &&
      !groupsCommentedImports &&
      !groupsCommentedAssumptions(previous, current),
  );
  const separatesMultilineDefinitions =
    separatesDefinitions(previous, current) && !current.leadingComments?.length;
  const separation: DeclarationSeparation = separatesLeadingComment
    ? "leading-comment"
    : separatesMultilineDefinitions
      ? "multiline-definitions"
      : null;
  const actualLineBreaks = sourceLayout.lineBreaksBetween(previousEnd, currentStart);
  const expectedLineBreaks = separation ? maxPreservedLineBreaks : Math.max(1, actualLineBreaks);

  return {
    previousEnd,
    currentStart,
    actualLineBreaks,
    expectedLineBreaks,
    separation,
    requiresNormalization: actualLineBreaks !== expectedLineBreaks,
    sharesLineWithPrevious: sourceLayout.areOnSameLine(previous.node, currentStart),
  };
}
