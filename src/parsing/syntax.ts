import type Parser from "tree-sitter";

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
      [
        "block_expression",
        "record_literal",
        "all_expression",
        "any_expression",
        "and_block_expression",
        "or_block_expression",
        "match_expression",
      ].includes(body.type),
  );
  return Boolean(
    arrow &&
      body &&
      (body.startPosition.row > arrow.endPosition.row ||
        (!hasBraceDelimitedBody && body.endPosition.row > arrow.endPosition.row)),
  );
}

export function isNestedInVerticallyExpandedCall(node: Parser.SyntaxNode): boolean {
  let ancestor = node.parent;

  while (ancestor) {
    if (ancestor.type === "call_expression") {
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
      const body = ancestor.childForFieldName("body") ?? ancestor.childForFieldName("value");
      return body?.id === node.id && node.startPosition.column > ancestor.startPosition.column;
    }
    ancestor = ancestor.parent;
  }

  return false;
}

export function isBlockCombinatorEntry(node: Parser.SyntaxNode): boolean {
  return Boolean(
    node.parent &&
      ["all_expression", "any_expression", "and_block_expression", "or_block_expression"].includes(
        node.parent.type,
      ),
  );
}

export function isOrdinaryBlockResult(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === "block_expression";
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
      parent?.type === "field_access_expression" &&
      parent.childForFieldName("object")?.id === node.id,
  );
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
    if (!continuesThroughCall && !continuesThroughField) break;
    current = parent;
  }
  return current;
}

export function isMultilineUfcsContinuation(node: Parser.SyntaxNode): boolean {
  if (node.type !== "field_access_expression") return false;
  const object = node.childForFieldName("object");
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
    const value =
      currentDefinition.childForFieldName("value") ?? currentDefinition.childForFieldName("body");
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
