import type Parser from "tree-sitter";

export type CommentPlacement = "leading" | "trailing" | "dangling";

export interface CommentAttachment {
  comment: Parser.SyntaxNode;
  owner: Parser.SyntaxNode;
  anchor?: Parser.SyntaxNode;
  placement: CommentPlacement;
}

export class CommentAttachmentIndex {
  readonly #byCommentId = new Map<number, CommentAttachment>();
  readonly #byOwnerId = new Map<number, CommentAttachment[]>();
  readonly #alignedLocalTrailingCommentIds = new Set<number>();

  add(attachment: CommentAttachment): void {
    this.#byCommentId.set(attachment.comment.id, attachment);
    const owned = this.#byOwnerId.get(attachment.owner.id) ?? [];
    owned.push(attachment);
    this.#byOwnerId.set(attachment.owner.id, owned);
  }

  attachmentFor(comment: Parser.SyntaxNode): CommentAttachment | undefined {
    return this.#byCommentId.get(comment.id);
  }

  commentsFor(owner: Parser.SyntaxNode, placement?: CommentPlacement): Parser.SyntaxNode[] {
    return (this.#byOwnerId.get(owner.id) ?? [])
      .filter((attachment) => !placement || attachment.placement === placement)
      .map((attachment) => attachment.comment);
  }

  markAlignedLocalTrailingComment(comment: Parser.SyntaxNode): void {
    this.#alignedLocalTrailingCommentIds.add(comment.id);
  }

  isAlignedLocalTrailingComment(comment: Parser.SyntaxNode): boolean {
    return this.#alignedLocalTrailingCommentIds.has(comment.id);
  }
}

export function attachComments(root: Parser.SyntaxNode): CommentAttachmentIndex {
  const index = new CommentAttachmentIndex();
  visitTree(root, index);
  return index;
}

function isComment(node: Parser.SyntaxNode): boolean {
  return node.type === "comment" || node.type === "documentation_comment";
}

function visitTree(owner: Parser.SyntaxNode, index: CommentAttachmentIndex): void {
  const children = owner.namedChildren;
  for (const [childIndex, child] of children.entries()) {
    if (!isComment(child)) continue;
    const previous = [...children.slice(0, childIndex)]
      .reverse()
      .find((candidate) => !isComment(candidate));
    const next = children.slice(childIndex + 1).find((candidate) => !isComment(candidate));
    const trailing = previous?.endPosition.row === child.startPosition.row;
    index.add({
      comment: child,
      owner,
      anchor: trailing ? previous : next,
      placement: trailing ? "trailing" : next ? "leading" : "dangling",
    });
  }
  for (const child of children) {
    if (!isComment(child)) visitTree(child, index);
  }
  if (
    owner.type === "nested_definition_expression" &&
    !(
      owner.parent?.type === "nested_definition_expression" &&
      owner.parent.childForFieldName("body")?.id === owner.id
    )
  ) {
    markAlignedLocalDefinitionComments(owner, index);
  }
}

function definitionBody(definition: Parser.SyntaxNode): Parser.SyntaxNode | null {
  return definition.childForFieldName("body") ?? definition.childForFieldName("value");
}

function markAlignedLocalDefinitionComments(
  chainRoot: Parser.SyntaxNode,
  index: CommentAttachmentIndex,
): void {
  const comments: Array<Parser.SyntaxNode | undefined> = [];
  let current: Parser.SyntaxNode | null = chainRoot;
  while (current?.type === "nested_definition_expression") {
    const definition = current.childForFieldName("definition");
    if (!definition) break;
    const body = definitionBody(definition);
    const trailingComment = body
      ? index
          .commentsFor(definition, "trailing")
          .find((comment) => comment.startIndex >= body.endIndex)
      : undefined;
    comments.push(trailingComment);
    current = current.childForFieldName("body");
  }

  for (const [commentIndex, comment] of comments.entries()) {
    if (!comment) continue;
    const column = comment.startPosition.column;
    if (
      comments[commentIndex - 1]?.startPosition.column === column ||
      comments[commentIndex + 1]?.startPosition.column === column
    ) {
      index.markAlignedLocalTrailingComment(comment);
    }
  }
}
