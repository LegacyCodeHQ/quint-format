import Quint from "@legacycodehq/tree-sitter-quint";
import type Parser from "tree-sitter";
import { continuationIndentLevels, defaultFormatPolicy } from "@/formatting/policy.js";
import { type CommentAttachmentIndex, isCommentNode } from "./comment-attachments.js";
import { areOnSameLine, hasLineBreakBetween, isMultiline } from "./source-layout.js";

const blockCombinatorSupertype = Quint.nodeTypeInfo.find(
  (node) => node.type === "_block_combinator_expression" && "subtypes" in node,
);
if (!blockCombinatorSupertype || !("subtypes" in blockCombinatorSupertype)) {
  throw new Error("The Quint grammar does not declare its block-combinator supertype");
}

const blockCombinatorEntryFields = new Map(
  blockCombinatorSupertype.subtypes.map((subtype) => {
    const nodeType = Quint.nodeTypeInfo.find((candidate) => candidate.type === subtype.type);
    if (!nodeType || !("fields" in nodeType)) {
      throw new Error(`The Quint grammar does not describe ${subtype.type}`);
    }
    const entryFields = Object.entries(nodeType.fields)
      .filter(
        ([, field]) =>
          field.multiple && field.types.some((childType) => childType.type === "_expression"),
      )
      .map(([name]) => name);
    if (entryFields.length !== 1) {
      throw new Error(`The Quint grammar does not identify one entry field for ${subtype.type}`);
    }
    return [subtype.type, entryFields[0] as string] as const;
  }),
);

export function isBlockCombinatorExpression(node: Parser.SyntaxNode): boolean {
  return blockCombinatorEntryFields.has(node.type);
}

export function blockCombinatorEntries(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const field = blockCombinatorEntryFields.get(node.type);
  return field ? node.childrenForFieldName(field) : [];
}

export function collectBlockCombinatorExpressions(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  return [
    ...(isBlockCombinatorExpression(node) ? [node] : []),
    ...node.namedChildren.flatMap(collectBlockCombinatorExpressions),
  ];
}

export function definitionBody(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  if (node.type === "value_definition") return node.childForFieldName("value");
  if (node.type === "operator_definition") return node.childForFieldName("body");
  return null;
}

export function isCompactNondetSequence(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
): boolean {
  return (
    definition.childForFieldName("qualifier")?.type === "nondet" && areOnSameLine(definition, body)
  );
}

export function isBraceDelimitedLambdaBody(node: Parser.SyntaxNode): boolean {
  return (
    isBlockCombinatorExpression(node) ||
    ["block_expression", "record_literal", "match_expression"].includes(node.type)
  );
}

export function isAttachedBraceConditionalBranch(node: Parser.SyntaxNode): boolean {
  return node.type === "block_expression" || (node.type === "record_literal" && isMultiline(node));
}

export function isLineBrokenConditionalBlockBranch(node: Parser.SyntaxNode): boolean {
  const conditional = node.parent;
  if (node.type !== "block_expression" || conditional?.type !== "if_expression") return false;

  if (conditional.childForFieldName("consequence")?.id === node.id) {
    const closeParen = conditional.children.find((child) => child.type === ")");
    return Boolean(closeParen && hasLineBreakBetween(closeParen, node));
  }

  if (conditional.childForFieldName("alternative")?.id === node.id) {
    const elseKeyword = conditional.children.find((child) => child.type === "else");
    return Boolean(elseKeyword && hasLineBreakBetween(elseKeyword, node));
  }

  return false;
}

export function isMultilineLambdaExpression(node: Parser.SyntaxNode): boolean {
  if (node.type !== "lambda_expression") return false;
  const arrow = node.children.find((child) => child.type === "=>");
  const body = node.childForFieldName("body");
  return Boolean(
    arrow &&
      body &&
      (hasLineBreakBetween(arrow, body) ||
        (!isBraceDelimitedLambdaBody(body) && isMultiline(body))),
  );
}

export function hasAttachedMultilineLambdaCallClose(node: Parser.SyntaxNode): boolean {
  if (!isCallExpression(node)) return false;
  const lambda = node.childrenForFieldName("argument").at(-1);
  const closeParenthesis = [...node.children].reverse().find((child) => child.type === ")");
  return Boolean(
    lambda?.type === "lambda_expression" &&
      isMultiline(lambda) &&
      closeParenthesis &&
      areOnSameLine(lambda, closeParenthesis),
  );
}

export function hasMultilineLambdaBody(node: Parser.SyntaxNode): boolean {
  const body = node.type === "lambda_expression" ? node.childForFieldName("body") : undefined;
  return Boolean(body && isMultiline(body));
}

export function hasInlineMultilineConditionalLambdaBody(node: Parser.SyntaxNode): boolean {
  if (node.type !== "lambda_expression") return false;
  const arrow = node.children.find((child) => child.type === "=>");
  const body = node.childForFieldName("body");
  return Boolean(
    arrow && body?.type === "if_expression" && areOnSameLine(arrow, body) && isMultiline(body),
  );
}

export function hasInlineMultilineNestedLambdaBody(node: Parser.SyntaxNode): boolean {
  if (node.type !== "lambda_expression") return false;
  const arrow = node.children.find((child) => child.type === "=>");
  const body = node.childForFieldName("body");
  return Boolean(
    arrow &&
      body &&
      isCallExpression(body) &&
      areOnSameLine(arrow, body) &&
      body
        .childrenForFieldName("argument")
        .some((argument) => argument.type === "lambda_expression" && isMultiline(argument)),
  );
}

const separatedValueShapes = new Map<string, { separator: string; value: string }>([
  ["pair_expression", { separator: "->", value: "right" }],
  ["record_literal_field", { separator: ":", value: "value" }],
]);

export function hasLineBrokenMultilineValue(node: Parser.SyntaxNode): boolean {
  const shape = separatedValueShapes.get(node.type);
  if (!shape) return false;
  const separator = node.children.find((child) => child.type === shape.separator);
  const value = node.childForFieldName(shape.value);
  return Boolean(separator && value && hasLineBreakBetween(separator, value) && isMultiline(value));
}

export function isNestedInVerticallyExpandedCall(node: Parser.SyntaxNode): boolean {
  let ancestor = node.parent;

  while (ancestor) {
    if (isCallExpression(ancestor)) {
      const openParenthesis = ancestor.children.find((child) => child.type === "(");
      const arguments_ = ancestor.childrenForFieldName("argument");
      const containsNodeAsArgument = arguments_.some(
        (argument) => argument.startIndex <= node.startIndex && argument.endIndex >= node.endIndex,
      );
      if (!containsNodeAsArgument) {
        ancestor = ancestor.parent;
        continue;
      }
      return arguments_.some((argument, index) => {
        const previous = index === 0 ? openParenthesis : arguments_[index - 1];
        return Boolean(previous && hasLineBreakBetween(previous, argument));
      });
    }
    ancestor = ancestor.parent;
  }

  return false;
}

export function isIndentedExpressionBody(node: Parser.SyntaxNode): boolean {
  let ancestor = node.parent;

  while (ancestor) {
    if (ancestor.type === "lambda_expression") {
      return ancestor.childForFieldName("body")?.id === node.id;
    }
    if (ancestor.type === "operator_definition" || ancestor.type === "value_definition") {
      const body = definitionBody(ancestor);
      return body?.id === node.id && node.startPosition.column > ancestor.startPosition.column;
    }
    ancestor = ancestor.parent;
  }

  return false;
}

export function isBlockCombinatorEntry(node: Parser.SyntaxNode): boolean {
  return Boolean(node.parent && isBlockCombinatorExpression(node.parent));
}

export function isWithinBlockCombinatorEntry(node: Parser.SyntaxNode): boolean {
  let current = node;
  while (current.parent) {
    if (
      isBlockCombinatorExpression(current.parent) &&
      blockCombinatorEntries(current.parent).some((entry) => entry.id === current.id)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function isOrdinaryBlockResult(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === "block_expression";
}

export function hasPeerMatchOperands(node: Parser.SyntaxNode): boolean {
  return (
    node.type === "binary_expression" &&
    node.childForFieldName("left")?.type === "match_expression" &&
    node.childForFieldName("right")?.type === "match_expression"
  );
}

export function isNestedDefinitionBody(node: Parser.SyntaxNode): boolean {
  return Boolean(
    node.parent?.type === "nested_definition_expression" &&
      node.parent.childForFieldName("body")?.id === node.id,
  );
}

export function isWithinConditionalCondition(node: Parser.SyntaxNode): boolean {
  let ancestor = node.parent;
  while (ancestor) {
    if (ancestor.type === "if_expression") {
      const condition = ancestor.childForFieldName("condition");
      return Boolean(
        condition && condition.startIndex <= node.startIndex && condition.endIndex >= node.endIndex,
      );
    }
    ancestor = ancestor.parent;
  }
  return false;
}

export function isWithinExpandedConditionalCondition(node: Parser.SyntaxNode): boolean {
  let ancestor = node.parent;
  while (ancestor) {
    if (ancestor.type === "if_expression") {
      const condition = ancestor.childForFieldName("condition");
      const openParen = ancestor.children.find((child) => child.type === "(");
      const closeParen = ancestor.children.find((child) => child.type === ")");
      if (!condition || !openParen || !closeParen) return false;
      const containsNode =
        condition.startIndex <= node.startIndex && condition.endIndex >= node.endIndex;
      return (
        containsNode &&
        (hasLineBreakBetween(openParen, condition) || hasLineBreakBetween(condition, closeParen))
      );
    }
    ancestor = ancestor.parent;
  }
  return false;
}

export function isElseIfBranch(node: Parser.SyntaxNode): boolean {
  return Boolean(
    node.parent?.type === "if_expression" &&
      node.parent.childForFieldName("alternative")?.id === node.id,
  );
}

export function isCompactElseIfLadder(node: Parser.SyntaxNode): boolean {
  let root = node;
  while (isElseIfBranch(root)) root = root.parent as Parser.SyntaxNode;
  if (root.childForFieldName("alternative")?.type !== "if_expression") return false;

  let branch = root;
  while (branch.type === "if_expression") {
    const condition = branch.childForFieldName("condition");
    const consequence = branch.childForFieldName("consequence");
    const alternative = branch.childForFieldName("alternative");
    const closeParen = branch.children.find((child) => child.type === ")");
    const elseKeyword = branch.children.find((child) => child.type === "else");
    if (!condition || !consequence || !alternative || !closeParen || !elseKeyword) return false;
    const breaksBeforeElse =
      hasLineBreakBetween(consequence, elseKeyword) && areOnSameLine(elseKeyword, alternative);
    const breaksAfterElse =
      areOnSameLine(consequence, elseKeyword) && hasLineBreakBetween(elseKeyword, alternative);
    if (
      isMultiline(condition) ||
      consequence.startPosition.row !== closeParen.endPosition.row ||
      consequence.endPosition.row !== closeParen.endPosition.row ||
      (!breaksBeforeElse && !breaksAfterElse)
    ) {
      return false;
    }
    if (alternative.type !== "if_expression") {
      return !isMultiline(alternative);
    }
    branch = alternative;
  }
  return false;
}

export function compactBlockExpression(
  body: Parser.SyntaxNode,
  commentAttachments: CommentAttachmentIndex,
): Parser.SyntaxNode | null {
  if (
    body.type !== "block_expression" ||
    isMultiline(body) ||
    isLineBrokenConditionalBlockBranch(body) ||
    body.endPosition.column > defaultFormatPolicy.lineWidth ||
    body.childrenForFieldName("binding").length > 0 ||
    commentAttachments.commentsFor(body).length > 0
  ) {
    return null;
  }

  return body.childForFieldName("expression");
}

export function compactNestedBlockExpression(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  commentAttachments: CommentAttachmentIndex,
): Parser.SyntaxNode | null {
  return areOnSameLine(definition, body) ? compactBlockExpression(body, commentAttachments) : null;
}

export function compactLambdaBlockExpression(
  lambda: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  commentAttachments: CommentAttachmentIndex,
): Parser.SyntaxNode | null {
  return lambda.startPosition.row === body.startPosition.row &&
    lambda.endPosition.column <= defaultFormatPolicy.lineWidth
    ? compactBlockExpression(body, commentAttachments)
    : null;
}

export function isMultilineParenthesizedPostfixReceiver(node: Parser.SyntaxNode): boolean {
  if (node.type !== "parenthesized_expression") return false;
  const expression = node.childForFieldName("expression");
  const target = node.parent ? postfixExpressionTarget(node.parent) : null;
  return Boolean(expression && isMultiline(expression) && target?.receiver.id === node.id);
}

export function isBraceDelimitedExpression(node: Parser.SyntaxNode): boolean {
  return (
    node.type === "block_expression" ||
    isBlockCombinatorExpression(node) ||
    (node.type === "lambda_expression" &&
      node.childForFieldName("body")?.type === "block_expression")
  );
}

export interface DirectCallExpressionTarget {
  kind: "direct";
  functionNode: Parser.SyntaxNode;
}

export interface UfcsCallExpressionTarget {
  kind: "ufcs";
  functionNode: Parser.SyntaxNode;
  receiver: Parser.SyntaxNode;
  method: Parser.SyntaxNode;
  dot: Parser.SyntaxNode;
}

export type CallExpressionTarget = DirectCallExpressionTarget | UfcsCallExpressionTarget;

export interface PostfixExpressionTarget {
  receiver: Parser.SyntaxNode;
  member: Parser.SyntaxNode;
  dot: Parser.SyntaxNode;
}

export function postfixExpressionTarget(node: Parser.SyntaxNode): PostfixExpressionTarget | null {
  if (node.type !== "field_access_expression" && node.type !== "ufcs_call_expression") return null;
  const receiver = node.childForFieldName(
    node.type === "ufcs_call_expression" ? "receiver" : "object",
  );
  const member = node.childForFieldName(node.type === "ufcs_call_expression" ? "method" : "field");
  const dot = node.children.find((child) => child.type === ".");
  return receiver && member && dot ? { receiver, member, dot } : null;
}

export function isCallExpression(node: Parser.SyntaxNode): boolean {
  return node.type === "call_expression" || node.type === "ufcs_call_expression";
}

export function callExpressionTarget(node: Parser.SyntaxNode): CallExpressionTarget | null {
  if (node.type === "ufcs_call_expression") {
    const target = postfixExpressionTarget(node);
    return target
      ? {
          kind: "ufcs",
          functionNode: target.member,
          receiver: target.receiver,
          method: target.member,
          dot: target.dot,
        }
      : null;
  }
  if (node.type !== "call_expression") return null;
  const functionNode = node.childForFieldName("function");
  return functionNode ? { kind: "direct", functionNode } : null;
}

export function ufcsChainRoot(node: Parser.SyntaxNode): Parser.SyntaxNode {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    const continuesThroughCall =
      parent.type === "call_expression" && parent.childForFieldName("function")?.id === current.id;
    const continuesThroughPostfix = postfixExpressionTarget(parent)?.receiver.id === current.id;
    if (!continuesThroughCall && !continuesThroughPostfix) break;
    current = parent;
  }
  return current;
}

export function isMultilineUfcsContinuation(node: Parser.SyntaxNode): boolean {
  const target = postfixExpressionTarget(node);
  return Boolean(target && hasLineBreakBetween(target.receiver, target.dot));
}

export function ufcsContinuationIndentation(): number {
  return continuationIndentLevels;
}

export function postfixContinuationIndentation(receiver: Parser.SyntaxNode): number {
  return isMultilineParenthesizedPostfixReceiver(receiver) ? 0 : ufcsContinuationIndentation();
}

export function collectNodes(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  return [
    ...(node.type === type ? [node] : []),
    ...node.namedChildren.flatMap((child) => collectNodes(child, type)),
  ];
}

export function isCompactMatchExpression(node: Parser.SyntaxNode): boolean {
  const arms = node.childrenForFieldName("arm");
  return Boolean(
    arms.length > 0 &&
      !isMultiline(node) &&
      node.endPosition.column <= defaultFormatPolicy.lineWidth &&
      collectNodes(node, "comment").length === 0 &&
      collectNodes(node, "documentation_comment").length === 0,
  );
}

export function isCompactDefaultMatch(node: Parser.SyntaxNode): boolean {
  const arms = node.childrenForFieldName("arm");
  const arm = arms[0];
  const variant = arm?.childForFieldName("variant");
  return Boolean(
    isCompactMatchExpression(node) &&
      arms.length === 1 &&
      arm &&
      variant?.type === "hole" &&
      !arm.childForFieldName("parameter"),
  );
}

export function callTrailingCommentAlignment(
  callExpression: Parser.SyntaxNode,
): Map<number, number> {
  const arguments_ = callExpression.childrenForFieldName("argument");
  const commas = callExpression.children.filter((child) => child.type === ",");
  const comments = callExpression.namedChildren.filter(isCommentNode);
  const entries = comments.flatMap((comment) => {
    const argument = [...arguments_]
      .reverse()
      .find(
        (candidate) =>
          candidate.endIndex <= comment.startIndex && areOnSameLine(candidate, comment),
      );
    if (!argument) return [];
    const comma = commas.find(
      (candidate) =>
        candidate.startIndex >= argument.endIndex && candidate.endIndex <= comment.startIndex,
    );
    return [{ comment, anchor: comma ?? argument }];
  });
  const expressesAlignment =
    entries.length >= 2 &&
    entries.every(
      ({ comment }) => comment.startPosition.column === entries[0]?.comment.startPosition.column,
    ) &&
    entries.some(
      ({ comment, anchor }) => comment.startPosition.column - anchor.endPosition.column >= 2,
    );
  if (!expressesAlignment) return new Map();

  const targetColumn = Math.max(...entries.map(({ anchor }) => anchor.endPosition.column)) + 1;
  return new Map(
    entries.map(({ comment, anchor }) => [
      comment.id,
      Math.max(1, targetColumn - anchor.endPosition.column),
    ]),
  );
}
