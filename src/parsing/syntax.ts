import Quint from "@legacycodehq/tree-sitter-quint";
import type Parser from "tree-sitter";
import type { CommentAttachmentIndex } from "./comment-attachments.js";

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
    definition.childForFieldName("qualifier")?.type === "nondet" &&
    definition.endPosition.row === body.startPosition.row
  );
}

function isBraceDelimitedLambdaBody(node: Parser.SyntaxNode): boolean {
  return (
    isBlockCombinatorExpression(node) ||
    ["block_expression", "record_literal", "match_expression"].includes(node.type)
  );
}

export function isMultilineLambdaExpression(node: Parser.SyntaxNode): boolean {
  if (node.type !== "lambda_expression") return false;
  const arrow = node.children.find((child) => child.type === "=>");
  const body = node.childForFieldName("body");
  return Boolean(
    arrow &&
      body &&
      (body.startPosition.row > arrow.endPosition.row ||
        (!isBraceDelimitedLambdaBody(body) && body.endPosition.row > arrow.endPosition.row)),
  );
}

export function hasAttachedMultilineLambdaCallClose(node: Parser.SyntaxNode): boolean {
  if (!isCallExpression(node)) return false;
  const lambda = node.childrenForFieldName("argument").at(-1);
  const closeParenthesis = [...node.children].reverse().find((child) => child.type === ")");
  return Boolean(
    lambda?.type === "lambda_expression" &&
      lambda.startPosition.row < lambda.endPosition.row &&
      closeParenthesis &&
      closeParenthesis.startPosition.row === lambda.endPosition.row,
  );
}

export function hasMultilineLambdaBody(node: Parser.SyntaxNode): boolean {
  const body = node.type === "lambda_expression" ? node.childForFieldName("body") : undefined;
  return Boolean(body && body.endPosition.row > body.startPosition.row);
}

export function hasInlineMultilineConditionalLambdaBody(node: Parser.SyntaxNode): boolean {
  if (node.type !== "lambda_expression") return false;
  const arrow = node.children.find((child) => child.type === "=>");
  const body = node.childForFieldName("body");
  return Boolean(
    arrow &&
      body?.type === "if_expression" &&
      body.startPosition.row === arrow.endPosition.row &&
      body.endPosition.row > body.startPosition.row,
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
  return Boolean(
    separator &&
      value &&
      value.startPosition.row > separator.endPosition.row &&
      value.endPosition.row > value.startPosition.row,
  );
}

export function hasMultilineLambdaCallRightOperand(node: Parser.SyntaxNode): boolean {
  if (node.type !== "binary_expression") return false;
  const right = node.childForFieldName("right");
  if (!right || !isCallExpression(right)) return false;
  const lastArgument = right.childrenForFieldName("argument").at(-1);
  return Boolean(lastArgument && hasMultilineLambdaBody(lastArgument));
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
        return Boolean(previous && argument.startPosition.row > previous.endPosition.row);
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
        (condition.startPosition.row > openParen.endPosition.row ||
          closeParen.startPosition.row > condition.endPosition.row)
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
    if (
      condition.startPosition.row !== condition.endPosition.row ||
      consequence.startPosition.row !== closeParen.endPosition.row ||
      consequence.endPosition.row !== closeParen.endPosition.row ||
      elseKeyword.startPosition.row <= consequence.endPosition.row ||
      alternative.startPosition.row !== elseKeyword.endPosition.row
    ) {
      return false;
    }
    if (alternative.type !== "if_expression") {
      return alternative.startPosition.row === alternative.endPosition.row;
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
    body.startPosition.row !== body.endPosition.row ||
    body.endPosition.column > 120 ||
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
  return definition.endPosition.row === body.startPosition.row
    ? compactBlockExpression(body, commentAttachments)
    : null;
}

export function compactLambdaBlockExpression(
  lambda: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  commentAttachments: CommentAttachmentIndex,
): Parser.SyntaxNode | null {
  return lambda.startPosition.row === body.startPosition.row && lambda.endPosition.column <= 120
    ? compactBlockExpression(body, commentAttachments)
    : null;
}

export function isMultilineParenthesizedPostfixReceiver(node: Parser.SyntaxNode): boolean {
  if (node.type !== "parenthesized_expression") return false;
  const expression = node.childForFieldName("expression");
  const target = node.parent ? postfixExpressionTarget(node.parent) : null;
  return Boolean(
    expression &&
      expression.startPosition.row < expression.endPosition.row &&
      target?.receiver.id === node.id,
  );
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
  return Boolean(target && target.dot.startPosition.row > target.receiver.endPosition.row);
}

export function ufcsContinuationIndentation(): number {
  return 2;
}

export function collectNodes(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  return [
    ...(node.type === type ? [node] : []),
    ...node.namedChildren.flatMap((child) => collectNodes(child, type)),
  ];
}

export function isCompactDefaultMatch(node: Parser.SyntaxNode): boolean {
  const arms = node.childrenForFieldName("arm");
  const arm = arms[0];
  const variant = arm?.childForFieldName("variant");
  return Boolean(
    arms.length === 1 &&
      arm &&
      variant?.type === "hole" &&
      !arm.childForFieldName("parameter") &&
      node.startPosition.row === node.endPosition.row &&
      node.endPosition.column <= 120 &&
      collectNodes(node, "comment").length === 0 &&
      collectNodes(node, "documentation_comment").length === 0,
  );
}

export function callTrailingCommentAlignment(
  callExpression: Parser.SyntaxNode,
): Map<number, number> {
  const arguments_ = callExpression.childrenForFieldName("argument");
  const commas = callExpression.children.filter((child) => child.type === ",");
  const comments = callExpression.namedChildren.filter(
    (child) => child.type === "comment" || child.type === "documentation_comment",
  );
  const entries = comments.flatMap((comment) => {
    const argument = [...arguments_]
      .reverse()
      .find(
        (candidate) =>
          candidate.endIndex <= comment.startIndex &&
          candidate.endPosition.row === comment.startPosition.row,
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
