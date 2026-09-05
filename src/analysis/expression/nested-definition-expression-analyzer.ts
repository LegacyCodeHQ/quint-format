import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "../../analysis.js";
import { commentDocument } from "../../formatting/comments.js";
import { concat, hardLine, text } from "../../formatting/document.js";
import { compactNestedBlockExpression, isCompactNondetSequence } from "../../syntax.js";
import { analyzeLocalDefinition } from "./local-definition-analyzer.js";

export function analyzeNestedDefinitionExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type === "nested_definition_expression") {
    const definition = node.childForFieldName("definition");
    const body = node.childForFieldName("body");
    if (!definition || !body) {
      throw new Error("Unable to locate the nested definition or body");
    }
    const definitionAnalysis = analyzeLocalDefinition(definition, analyzeExpression);
    const bodyAnalysis = analyzeExpression(body);
    const compactBlockExpression = compactNestedBlockExpression(definition, body);
    const compactBlockAnalysis = compactBlockExpression
      ? analyzeExpression(compactBlockExpression)
      : null;
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= definition.endIndex &&
        child.endIndex <= body.startIndex,
    );
    const definitionValue =
      definition.childForFieldName("value") ?? definition.childForFieldName("body");
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
    const preservesLeadingCommentGap = Boolean(
      firstComment &&
        definitionValue &&
        firstComment.startPosition.row > definitionValue.endPosition.row + 1,
    );
    const preservesBodyGap =
      leadingBodyComments.length === 0 &&
      definitionValue !== null &&
      body.startPosition.row > definitionValue.endPosition.row + 1;
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
              ...(preservesBodyGap || preservesLeadingCommentGap ? [hardLine] : []),
              ...leadingBodyComments.flatMap((comment) => [commentDocument(comment), hardLine]),
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
