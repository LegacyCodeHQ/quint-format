import type Parser from "tree-sitter";
import type { ModuleDeclaration } from "@/core/analysis.js";
import {
  commentDocument,
  leadingCommentsDocument,
  preservesTrailingCommentAlignment,
} from "@/formatting/comments.js";
import { concat, hardLine, text } from "@/formatting/document.js";
import { isBlockComment, isCommentNode, isLineComment } from "@/parsing/comment-attachments.js";

export class ModuleDeclarationCollector {
  readonly declarations: ModuleDeclaration[] = [];
  private pendingComments: Parser.SyntaxNode[] = [];

  constructor(private readonly moduleNode: Parser.SyntaxNode) {}

  get danglingComments(): Parser.SyntaxNode[] {
    return this.pendingComments;
  }

  add(declaration: ModuleDeclaration): void {
    const leadingComments = this.pendingComments;
    this.pendingComments = [];
    this.declarations.push({
      ...declaration,
      leadingComments,
      document: concat([
        leadingCommentsDocument(leadingComments, declaration.node),
        declaration.document,
      ]),
    });
  }

  consumeComment(node: Parser.SyntaxNode): boolean {
    if (!isCommentNode(node)) return false;

    if (isBlockComment(node) && this.attachBoundaryComment(node)) {
      return true;
    }

    if (isLineComment(node) && this.attachTrailingComment(node)) {
      return true;
    }

    this.pendingComments.push(node);
    return true;
  }

  private attachBoundaryComment(node: Parser.SyntaxNode): boolean {
    const previousDeclaration = this.declarations.at(-1);
    const nextContent = node.nextNamedSibling;
    const closesPreviousGroup = Boolean(
      previousDeclaration &&
        this.pendingComments.length === 0 &&
        node.startPosition.row === previousDeclaration.node.endPosition.row + 1 &&
        node.startPosition.column === previousDeclaration.node.startPosition.column &&
        nextContent &&
        nextContent.startPosition.row >= node.endPosition.row + 2,
    );
    if (!previousDeclaration || !closesPreviousGroup) return false;

    previousDeclaration.trailingComments = [...(previousDeclaration.trailingComments ?? []), node];
    previousDeclaration.document = concat([
      previousDeclaration.document,
      hardLine,
      commentDocument(node),
    ]);
    return true;
  }

  private attachTrailingComment(node: Parser.SyntaxNode): boolean {
    const previousDeclaration = this.declarations.at(-1);
    const previousTrailingComment = previousDeclaration?.trailingComments?.at(-1);
    const continuesTrailingComment = Boolean(
      previousTrailingComment &&
        node.startPosition.row === previousTrailingComment.endPosition.row + 1 &&
        node.startPosition.column === previousTrailingComment.startPosition.column,
    );
    const startsIndentedTrailingComment = Boolean(
      previousDeclaration &&
        !previousTrailingComment &&
        node.startPosition.row === previousDeclaration.node.endPosition.row + 1 &&
        node.startPosition.column > previousDeclaration.node.startPosition.column,
    );
    if (
      !previousDeclaration ||
      this.pendingComments.length > 0 ||
      (node.startPosition.row !== previousDeclaration.node.endPosition.row &&
        !continuesTrailingComment &&
        !startsIndentedTrailingComment)
    ) {
      return false;
    }

    previousDeclaration.trailingComments = [...(previousDeclaration.trailingComments ?? []), node];
    if (continuesTrailingComment || startsIndentedTrailingComment) {
      previousDeclaration.document = concat([
        previousDeclaration.document,
        hardLine,
        text(
          " ".repeat(
            Math.max(0, node.startPosition.column - previousDeclaration.node.startPosition.column),
          ),
        ),
        commentDocument(node),
      ]);
      return true;
    }

    const sourceCommentGap = this.moduleNode.text.slice(
      previousDeclaration.node.endIndex - this.moduleNode.startIndex,
      node.startIndex - this.moduleNode.startIndex,
    );
    const preservesAlignment =
      previousDeclaration.valueNode?.type === "sum_type" ||
      preservesTrailingCommentAlignment(sourceCommentGap);
    previousDeclaration.document = concat([
      previousDeclaration.document,
      text(preservesAlignment ? sourceCommentGap : " "),
      commentDocument(node),
    ]);
    return true;
  }
}
