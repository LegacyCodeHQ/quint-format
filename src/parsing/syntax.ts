import Quint from "@legacycodehq/tree-sitter-quint";
import type Parser from "tree-sitter";

const LEGACY_BLOCK_COMBINATOR_TYPES = [
  "all_expression",
  "and_block_expression",
  "any_expression",
  "or_block_expression",
];

const blockCombinatorSupertype = Quint.nodeTypeInfo.find(
  (node) => node.type === "_block_combinator_expression" && "subtypes" in node,
);
const blockCombinatorTypes = new Set(
  blockCombinatorSupertype && "subtypes" in blockCombinatorSupertype
    ? blockCombinatorSupertype.subtypes.map((subtype) => subtype.type)
    : LEGACY_BLOCK_COMBINATOR_TYPES,
);

export function isBlockCombinatorExpression(node: Parser.SyntaxNode): boolean {
  return blockCombinatorTypes.has(node.type);
}

export function blockCombinatorEntries(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  if (!isBlockCombinatorExpression(node)) return [];
  for (const field of ["entry", "choice", "conjunct", "disjunct"]) {
    const entries = node.childrenForFieldName(field);
    if (entries.length > 0) return entries;
  }
  return [];
}

export function collectBlockCombinatorExpressions(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  return [
    ...(isBlockCombinatorExpression(node) ? [node] : []),
    ...node.namedChildren.flatMap(collectBlockCombinatorExpressions),
  ];
}

export function definitionBody(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  if (node.type !== "value_definition" && node.type !== "operator_definition") return null;
  return node.childForFieldName("body") ?? node.childForFieldName("value");
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

export function isMultilineLambdaExpression(node: Parser.SyntaxNode): boolean {
  if (node.type !== "lambda_expression") return false;
  const arrow = node.children.find((child) => child.type === "=>");
  const body = node.childForFieldName("body");
  const hasBraceDelimitedBody = Boolean(
    body &&
      (isBlockCombinatorExpression(body) ||
        ["block_expression", "record_literal", "match_expression"].includes(body.type)),
  );
  return Boolean(
    arrow &&
      body &&
      (body.startPosition.row > arrow.endPosition.row ||
        (!hasBraceDelimitedBody && body.endPosition.row > arrow.endPosition.row)),
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

export function hasLineBrokenMultilineMapValue(node: Parser.SyntaxNode): boolean {
  if (node.type !== "binary_expression" && node.type !== "pair_expression") return false;
  const operator =
    node.type === "pair_expression"
      ? node.children.find((child) => child.type === "->")
      : node.childForFieldName("operator");
  const right = node.childForFieldName("right");
  return Boolean(
    operator?.text === "->" &&
      right &&
      right.startPosition.row > operator.endPosition.row &&
      right.endPosition.row > right.startPosition.row,
  );
}

export function hasLineBrokenMultilineRecordFieldValue(node: Parser.SyntaxNode): boolean {
  if (node.type !== "record_literal_field") return false;
  const colon = node.children.find((child) => child.type === ":");
  const value = node.childForFieldName("value");
  return Boolean(
    colon &&
      value &&
      value.startPosition.row > colon.endPosition.row &&
      value.endPosition.row > value.startPosition.row,
  );
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

export function compactNestedBlockExpression(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
): Parser.SyntaxNode | null {
  if (
    body.type !== "block_expression" ||
    definition.endPosition.row !== body.startPosition.row ||
    body.startPosition.row !== body.endPosition.row ||
    body.endPosition.column > 120 ||
    body.childrenForFieldName("binding").length > 0 ||
    body.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    )
  ) {
    return null;
  }

  return body.childForFieldName("expression");
}

export function compactLambdaBlockExpression(
  lambda: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
): Parser.SyntaxNode | null {
  if (
    body.type !== "block_expression" ||
    lambda.startPosition.row !== body.startPosition.row ||
    body.startPosition.row !== body.endPosition.row ||
    lambda.endPosition.column > 120 ||
    body.childrenForFieldName("binding").length > 0 ||
    body.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    )
  ) {
    return null;
  }

  return body.childForFieldName("expression");
}

export function isMultilineParenthesizedPostfixReceiver(node: Parser.SyntaxNode): boolean {
  if (node.type !== "parenthesized_expression") return false;
  const expression = node.childForFieldName("expression");
  const parent = node.parent;
  return Boolean(
    expression &&
      expression.startPosition.row < expression.endPosition.row &&
      ((parent?.type === "field_access_expression" &&
        parent.childForFieldName("object")?.id === node.id) ||
        (parent?.type === "ufcs_call_expression" &&
          parent.childForFieldName("receiver")?.id === node.id)),
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

export interface CallExpressionTarget {
  functionNode: Parser.SyntaxNode;
  receiver?: Parser.SyntaxNode;
  method?: Parser.SyntaxNode;
  dot?: Parser.SyntaxNode;
}

export function isCallExpression(node: Parser.SyntaxNode): boolean {
  return node.type === "call_expression" || node.type === "ufcs_call_expression";
}

export function callExpressionTarget(node: Parser.SyntaxNode): CallExpressionTarget | null {
  if (node.type === "ufcs_call_expression") {
    const receiver = node.childForFieldName("receiver");
    const method = node.childForFieldName("method");
    const dot = node.children.find((child) => child.type === ".");
    return receiver && method ? { functionNode: method, receiver, method, dot } : null;
  }
  if (node.type !== "call_expression") return null;
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return null;
  if (functionNode.type !== "field_access_expression") return { functionNode };
  return {
    functionNode,
    receiver: functionNode.childForFieldName("object") ?? undefined,
    method: functionNode.childForFieldName("field") ?? undefined,
    dot: functionNode.children.find((child) => child.type === "."),
  };
}

export function ufcsChainRoot(node: Parser.SyntaxNode): Parser.SyntaxNode {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    const continuesThroughCall =
      parent.type === "call_expression" && parent.childForFieldName("function")?.id === current.id;
    const continuesThroughField =
      parent.type === "field_access_expression" &&
      parent.childForFieldName("object")?.id === current.id;
    const continuesThroughNamedUfcs =
      parent.type === "ufcs_call_expression" &&
      parent.childForFieldName("receiver")?.id === current.id;
    if (!continuesThroughCall && !continuesThroughField && !continuesThroughNamedUfcs) break;
    current = parent;
  }
  return current;
}

export function isMultilineUfcsContinuation(node: Parser.SyntaxNode): boolean {
  if (node.type !== "field_access_expression" && node.type !== "ufcs_call_expression") return false;
  const object = node.childForFieldName(
    node.type === "ufcs_call_expression" ? "receiver" : "object",
  );
  const dot = node.children.find((child) => child.type === ".");
  return Boolean(object && dot && dot.startPosition.row > object.endPosition.row);
}

export function ufcsContinuationIndentation(): number {
  return 2;
}

export function preservesDefinitionBodyLineBreak(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
): boolean {
  const equals = definition.children.find((child) => child.type === "=");
  const hasBodyComments = definition.namedChildren.some(
    (child) =>
      (child.type === "comment" || child.type === "documentation_comment") &&
      equals &&
      child.startIndex >= equals.endIndex &&
      child.endIndex <= body.startIndex,
  );
  return Boolean(equals && !hasBodyComments && body.startPosition.row > equals.endPosition.row);
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

export function isAlignedLocalTrailingComment(
  definition: Parser.SyntaxNode,
  comment: Parser.SyntaxNode,
): boolean {
  let chainRoot = definition.parent;
  if (chainRoot?.type !== "nested_definition_expression") return false;

  while (
    chainRoot.parent?.type === "nested_definition_expression" &&
    chainRoot.parent.childForFieldName("body")?.id === chainRoot.id
  ) {
    chainRoot = chainRoot.parent;
  }

  const commentColumns: Array<number | undefined> = [];
  const definitionIds: number[] = [];
  let current: Parser.SyntaxNode | null = chainRoot;
  while (current?.type === "nested_definition_expression") {
    const currentDefinition = current.childForFieldName("definition");
    if (!currentDefinition) break;
    const value = definitionBody(currentDefinition);
    const trailingComment = value
      ? currentDefinition.namedChildren.find(
          (child) =>
            (child.type === "comment" || child.type === "documentation_comment") &&
            child.startIndex >= value.endIndex &&
            child.startPosition.row === value.endPosition.row,
        )
      : undefined;
    definitionIds.push(currentDefinition.id);
    commentColumns.push(trailingComment?.startPosition.column);
    current = current.childForFieldName("body");
  }

  const index = definitionIds.indexOf(definition.id);
  if (index < 0 || commentColumns[index] !== comment.startPosition.column) return false;
  return (
    commentColumns[index - 1] === comment.startPosition.column ||
    commentColumns[index + 1] === comment.startPosition.column
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
