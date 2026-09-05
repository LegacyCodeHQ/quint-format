import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { concat, hardLine, indent, text } from "@/formatting/document.js";
import { isElseIfBranch } from "@/parsing/syntax.js";

export function analyzeConditionalExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type === "if_expression") {
    const condition = node.childForFieldName("condition");
    const consequence = node.childForFieldName("consequence");
    const alternative = node.childForFieldName("alternative");
    const closeParen = node.children.find((child) => child.type === ")");
    const elseKeyword = node.children.find((child) => child.type === "else");
    if (!condition || !consequence || !alternative || !closeParen || !elseKeyword) {
      throw new Error("Unable to locate the conditional branches");
    }
    const analyses = [condition, consequence, alternative].map(analyzeExpression);
    const [conditionAnalysis, consequenceAnalysis, alternativeAnalysis] = analyses;
    if (!conditionAnalysis || !consequenceAnalysis || !alternativeAnalysis) {
      throw new Error("Unable to analyze the conditional branches");
    }
    const consequenceComments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= condition.endIndex &&
        child.endIndex <= consequence.startIndex,
    );
    const alternativeComments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= consequence.endIndex &&
        child.endIndex <= alternative.startIndex,
    );
    const trailingConsequenceComments = alternativeComments.filter(
      (comment) => comment.startPosition.row === consequence.endPosition.row,
    );
    const leadingAlternativeComments = alternativeComments.filter(
      (comment) => !trailingConsequenceComments.some((trailing) => trailing.id === comment.id),
    );
    const inlineElseComment =
      leadingAlternativeComments.length === 1 &&
      leadingAlternativeComments[0]?.startPosition.row === elseKeyword.endPosition.row
        ? leadingAlternativeComments[0]
        : undefined;
    let consequenceCommentAnchor = consequence;
    const trailingConsequenceDocuments = trailingConsequenceComments.flatMap((comment) => {
      const gap = node.text.slice(
        consequenceCommentAnchor.endIndex - node.startIndex,
        comment.startIndex - node.startIndex,
      );
      consequenceCommentAnchor = comment;
      return [text(gap), commentDocument(comment)];
    });
    const consequenceDocument = concat([
      consequenceAnalysis.document,
      ...trailingConsequenceDocuments,
    ]);
    const expandsSourceMultilineCondition = condition.startPosition.row < condition.endPosition.row;
    const expandsConditionalChain = alternative.type === "if_expression";
    const formatsConditionalChain = expandsConditionalChain || isElseIfBranch(node);
    const hasSourceElseBreak = elseKeyword.startPosition.row > consequence.endPosition.row;
    const separatesCommentedElse = leadingAlternativeComments.length > 0;
    const preservesConsequenceLineBreak =
      consequence.type !== "block_expression" &&
      consequenceComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        hasSourceElseBreak ||
        leadingAlternativeComments.length > 0 ||
        consequence.startPosition.row > closeParen.endPosition.row);
    const preservesElseLineBreak =
      consequence.type !== "block_expression" &&
      leadingAlternativeComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        elseKeyword.startPosition.row > consequence.endPosition.row);
    const preservesAlternativeLineBreak =
      alternative.type !== "block_expression" &&
      alternative.type !== "if_expression" &&
      leadingAlternativeComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        hasSourceElseBreak ||
        alternative.startPosition.row > elseKeyword.endPosition.row);
    return {
      document: concat([
        text("if ("),
        conditionAnalysis.document,
        ...(consequenceComments.length === 0
          ? preservesConsequenceLineBreak
            ? [text(")"), indent(concat([hardLine, consequenceDocument]))]
            : [text(") "), consequenceDocument]
          : [
              text(")"),
              indent(
                concat([
                  ...consequenceComments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  consequenceDocument,
                ]),
              ),
            ]),
        ...(inlineElseComment
          ? [
              hardLine,
              text("else"),
              text(
                node.text.slice(
                  elseKeyword.endIndex - node.startIndex,
                  inlineElseComment.startIndex - node.startIndex,
                ),
              ),
              commentDocument(inlineElseComment),
              indent(concat([hardLine, alternativeAnalysis.document])),
            ]
          : leadingAlternativeComments.length === 0
            ? [
                ...(preservesElseLineBreak ? [hardLine, text("else")] : [text(" else")]),
                ...(preservesAlternativeLineBreak
                  ? [indent(concat([hardLine, alternativeAnalysis.document]))]
                  : [text(" "), alternativeAnalysis.document]),
              ]
            : [
                ...(separatesCommentedElse ? [hardLine, text("else")] : [text(" else")]),
                indent(
                  concat([
                    ...leadingAlternativeComments.flatMap((comment) => [
                      hardLine,
                      commentDocument(comment),
                    ]),
                    hardLine,
                    alternativeAnalysis.document,
                  ]),
                ),
              ]),
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
