import type Parser from "tree-sitter";
import type { OperatorBreakPlan } from "@/core/analysis.js";
import { continuationIndentLevels, structuralIndentLevels } from "@/formatting/policy.js";
import {
  hasLineBrokenMultilineValue,
  hasPeerMatchOperands,
  isBlockCombinatorEntry,
  isIndentedExpressionBody,
  isNestedDefinitionBody,
  isNestedInVerticallyExpandedCall,
  isOrdinaryBlockResult,
  isWithinBlockCombinatorEntry,
  isWithinConditionalCondition,
  isWithinExpandedConditionalCondition,
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

export type OperatorIndentKind = "match-peers" | "expanded-condition" | "continuation";

export type RightIndentKind = "match-peers" | "continued-operator" | "pair-value" | "continuation";

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
  ["pair-value", hasLineBrokenMultilineValue],
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

export interface OperatorBreakSites {
  left: Parser.SyntaxNode;
  operator: Parser.SyntaxNode;
  right: Parser.SyntaxNode;
  hasComments: boolean;
}

export function planOperatorBreaks(
  node: Parser.SyntaxNode,
  sites: OperatorBreakSites,
): OperatorBreakPlan {
  const operatorReason = operatorBreakReason(node);
  const rightReason = rightBreakReason(node);
  const brokeBeforeOperator = sites.operator.startPosition.row > sites.left.endPosition.row;
  const brokeBeforeRight = sites.right.startPosition.row > sites.operator.endPosition.row;
  const operatorBreak = !sites.hasComments && brokeBeforeOperator && operatorReason !== null;
  const pairValue = hasLineBrokenMultilineValue(node);
  const matchPeers = hasPeerMatchOperands(node);
  const expandedCondition = isWithinExpandedConditionalCondition(node);
  return {
    operatorBreak,
    rightBreak: brokeBeforeRight && rightReason !== null,
    operatorReason,
    rightReason,
    pairValue,
    matchPeers,
    expandedCondition,
    operatorIndent: expandedCondition || matchPeers ? 0 : continuationIndentLevels,
    rightIndent: matchPeers
      ? 0
      : operatorBreak
        ? continuationIndentLevels * 2
        : pairValue
          ? structuralIndentLevels
          : continuationIndentLevels,
    operatorIndentKind: matchPeers
      ? "match-peers"
      : expandedCondition
        ? "expanded-condition"
        : "continuation",
    rightIndentKind: matchPeers
      ? "match-peers"
      : operatorBreak
        ? "continued-operator"
        : pairValue
          ? "pair-value"
          : "continuation",
  };
}
