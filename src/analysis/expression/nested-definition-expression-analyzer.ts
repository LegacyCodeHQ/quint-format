import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { concat, hardLine, text } from "@/formatting/document.js";
import { requiresNestedDefinitionResultGap } from "@/formatting/nested-definition-formatter.js";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
import {
  compactNestedBlockExpression,
  definitionBody,
  isCompactNondetSequence,
} from "@/parsing/syntax.js";
import { analyzeLocalDefinition } from "./local-definition-analyzer.js";

export function analyzeNestedDefinitionExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
  commentAttachments: CommentAttachmentIndex,
): ExpressionAnalysis | undefined {
  if (node.type === "nested_definition_expression") {
    const definition = node.childForFieldName("definition");
    const body = node.childForFieldName("body");
    if (!definition || !body) {
      throw new Error("Unable to locate the nested definition or body");
    }
    const definitionAnalysis = analyzeLocalDefinition(
      definition,
      analyzeExpression,
      commentAttachments,
    );
    const bodyAnalysis = analyzeExpression(body);
    const compactBlockExpression = compactNestedBlockExpression(
      definition,
      body,
      commentAttachments,
    );
    const compactBlockAnalysis = compactBlockExpression
      ? analyzeExpression(compactBlockExpression)
      : null;
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= definition.endIndex &&
        child.endIndex <= body.startIndex,
    );
    const definitionValue = definitionBody(definition);
    const trailingDefinitionComments = comments.filter(
      (comment) => comment.startPosition.row === definitionValue?.endPosition.row,
    );
    const leadingBodyComments = comments.filter(
      (comment) => comment.startPosition.row !== definitionValue?.endPosition.row,
    );
    const semicolon = definition.children.find((child) => child.type === ";");
    let trailingCommentAnchor =
      semicolon?.endIndex ?? definitionValue?.endIndex ?? definition.endIndex;
    const definitionDocument = concat([
      definitionAnalysis.document,
      ...trailingDefinitionComments.flatMap((comment) => {
        const gap = node.text.slice(
          trailingCommentAnchor - node.startIndex,
          comment.startIndex - node.startIndex,
        );
        trailingCommentAnchor = comment.endIndex;
        return [text(gap), commentDocument(comment)];
      }),
    ]);
    const firstComment = leadingBodyComments[0];
    const lastComment = leadingBodyComments.at(-1);
    const preservesLeadingCommentGap = Boolean(
      firstComment &&
        definitionValue &&
        firstComment.startPosition.row > definitionValue.endPosition.row + 1,
    );
    const preservesBodyGap =
      leadingBodyComments.length === 0 &&
      definitionValue !== null &&
      body.startPosition.row > definitionValue.endPosition.row + 1;
    const requiresBodyGap = requiresNestedDefinitionResultGap(
      definition,
      body,
      leadingBodyComments.length > 0,
    );
    const preservesLeadingCommentsBodyGap = Boolean(
      lastComment && body.startPosition.row > lastComment.endPosition.row + 1,
    );
    const preservesCompactNondetSequence = isCompactNondetSequence(definition, body);
    const analyses = [definitionAnalysis, bodyAnalysis];
    return {
      document: compactBlockAnalysis
        ? concat([definitionDocument, text(" { "), compactBlockAnalysis.document, text(" }")])
        : preservesCompactNondetSequence
          ? concat([definitionDocument, text(semicolon ? "; " : " "), bodyAnalysis.document])
          : concat([
              definitionDocument,
              hardLine,
              ...(requiresBodyGap || preservesBodyGap || preservesLeadingCommentGap
                ? [hardLine]
                : []),
              ...leadingBodyComments.flatMap((comment, index) => {
                const nextComment = leadingBodyComments[index + 1];
                const preservesCommentGroupGap = Boolean(
                  nextComment && nextComment.startPosition.row > comment.endPosition.row + 1,
                );
                return [
                  commentDocument(comment),
                  hardLine,
                  ...(preservesCommentGroupGap ? [hardLine] : []),
                ];
              }),
              ...(preservesLeadingCommentsBodyGap ? [hardLine] : []),
              bodyAnalysis.document,
            ]),
      binaryOperators: analyses.flatMap((analysis) => analysis.binaryOperators),
      unitLiterals: analyses.flatMap((analysis) => analysis.unitLiterals),
      sequenceLiterals: analyses.flatMap((analysis) => analysis.sequenceLiterals),
      recordLiterals: analyses.flatMap((analysis) => analysis.recordLiterals),
      callExpressions: analyses.flatMap((analysis) => analysis.callExpressions),
    };
  }

  return undefined;
}
