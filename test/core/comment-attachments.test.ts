import { describe, expect, test } from "bun:test";
import { attachComments } from "@/parsing/comment-attachments.js";
import { parseQuint } from "@/parsing/parser.js";
import { collectNodes } from "@/parsing/syntax.js";

describe("comment attachments", () => {
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
      expect(attachment?.placement).toBe("trailing");
      expect(attachment?.owner.type).toBe("value_definition");
      expect(attachment?.anchor?.type).toBe("integer_literal");
      expect(attachments.isAlignedLocalTrailingComment(comment)).toBe(true);
    }
  });
});
