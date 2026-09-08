import { describe, expect, test } from "bun:test";
import type Parser from "tree-sitter";
import {
  attachComments,
  isCommentNode,
  isDocumentationComment,
  isOrdinaryComment,
} from "@/parsing/comment-attachments.js";
import { parseQuint } from "@/parsing/parser.js";
import { collectNodes } from "@/parsing/syntax.js";

describe("comment attachments", () => {
  test("classifies both Quint comment node types", () => {
    const root = parseQuint(`// Line comment
/// Documentation comment
module Example { /* Block comment */ }`);

    expect(root.namedChildren.filter(isCommentNode).map((node) => node.type)).toEqual([
      "comment",
      "documentation_comment",
    ]);
    expect(isCommentNode(root.namedChildren.at(-1) as Parser.SyntaxNode)).toBe(false);
    expect(isOrdinaryComment(root.namedChildren[0] as Parser.SyntaxNode)).toBe(true);
    expect(isDocumentationComment(root.namedChildren[1] as Parser.SyntaxNode)).toBe(true);
  });

  test("indexes aligned local trailing comments in one parse-tree pass", () => {
    const root = parseQuint(`module Example {
  pure def total = {
    val first = 1   // First
    val second = 22 // Second
    first + second
  }
}`);

    const attachments = attachComments(root);
    const comments = collectNodes(root, "comment");

    expect(comments).toHaveLength(2);
    for (const comment of comments) {
      const attachment = attachments.attachmentFor(comment);
      expect(attachment).toBeDefined();
      if (!attachment) throw new Error("Expected the comment to be attached");
      expect(attachment.placement).toBe("trailing");
      expect(attachment.owner.type).toBe("value_definition");
      expect(attachment.anchor?.type).toBe("integer_literal");
      expect(
        attachments.commentsBetween(
          attachment.owner,
          attachment.anchor?.endIndex ?? 0,
          comment.endIndex,
        ),
      ).toContain(comment);
      expect(attachments.isAlignedLocalTrailingComment(comment)).toBe(true);
    }
  });
});
