import type Parser from "tree-sitter";
import {
  hasLineBrokenMultilinePairValue,
  isBlockCombinatorEntry,
  isIndentedExpressionBody,
  isNestedDefinitionBody,
  isNestedInVerticallyExpandedCall,
  isOrdinaryBlockResult,
  isWithinBlockCombinatorEntry,
  isWithinConditionalCondition,
} from "./syntax.js";

export type BreakReason =
  | "conditional-condition"
  | "expression-body"
  | "block-combinator-entry"
  | "within-block-combinator-entry"
  | "ordinary-block-result"
  | "nested-definition-body"
  | "expanded-call"
  | "pair-value";

type BreakAuthority = readonly [BreakReason, (node: Parser.SyntaxNode) => boolean];

const operatorBreakAuthorities: readonly BreakAuthority[] = [
  ["conditional-condition", isWithinConditionalCondition],
  ["expression-body", isIndentedExpressionBody],
  ["block-combinator-entry", isBlockCombinatorEntry],
  ["within-block-combinator-entry", isWithinBlockCombinatorEntry],
  ["ordinary-block-result", isOrdinaryBlockResult],
  ["nested-definition-body", isNestedDefinitionBody],
  ["expanded-call", isNestedInVerticallyExpandedCall],
];

const rightBreakAuthorities: readonly BreakAuthority[] = [
  ["expression-body", isIndentedExpressionBody],
  ["block-combinator-entry", isBlockCombinatorEntry],
  ["ordinary-block-result", isOrdinaryBlockResult],
  ["nested-definition-body", isNestedDefinitionBody],
  ["pair-value", hasLineBrokenMultilinePairValue],
];

function firstReason(
  authorities: readonly BreakAuthority[],
  node: Parser.SyntaxNode,
): BreakReason | null {
  return authorities.find(([, holds]) => holds(node))?.[0] ?? null;
}

export function operatorBreakReason(node: Parser.SyntaxNode): BreakReason | null {
  return firstReason(operatorBreakAuthorities, node);
}

export function rightBreakReason(node: Parser.SyntaxNode): BreakReason | null {
  return firstReason(rightBreakAuthorities, node);
}
