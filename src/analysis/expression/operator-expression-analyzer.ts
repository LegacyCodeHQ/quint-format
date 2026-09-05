import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "../../analysis.js";
import { commentDocument } from "../../formatting/comments.js";
import { indentBy } from "../../formatting/definition-body-formatter.js";
import { concat, hardLine, indent, text } from "../../formatting/document.js";
import {
  isBlockCombinatorEntry,
  isIndentedExpressionBody,
  isNestedDefinitionBody,
  isOrdinaryBlockResult,
  isWithinConditionalCondition,
} from "../../syntax.js";

export function analyzeOperatorExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type === "unary_expression") {
    const operator = node.childForFieldName("operator");
    const operand = node.childForFieldName("operand");
    if (!operator || !operand) {
      throw new Error("Unable to locate the unary expression operands");
    }
    const analysis = analyzeExpression(operand);
    return {
      document: concat([text(operator.text), analysis.document]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  if (node.type === "binary_expression") {
    const left = node.childForFieldName("left");
    const right = node.childForFieldName("right");
    const operator = node.childForFieldName("operator");
    if (!left || !right || !operator) {
      throw new Error("Formatting this binary expression syntax is not implemented yet");
    }

    const inlineComments = node.children.filter(
      (child) =>
        child.type === "comment" &&
        child.startIndex >= left.endIndex &&
        child.endIndex <= operator.startIndex,
    );
    const rightComments = node.children.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= operator.endIndex &&
        child.endIndex <= right.startIndex,
    );
    const operatorTrailingComments = rightComments.filter(
      (comment) => comment.startPosition.row === operator.endPosition.row,
    );
    const rightOperandComments = rightComments.filter(
      (comment) => comment.startPosition.row !== operator.endPosition.row,
    );
    if (inlineComments.some((comment) => /[\r\n]/.test(comment.text))) {
      throw new Error("Formatting this inline comment syntax is not implemented yet");
    }

    const leftAnalysis = analyzeExpression(left);
    const rightAnalysis = analyzeExpression(right);
    const comments = inlineComments.flatMap((comment) => [text(" "), commentDocument(comment)]);
    const hasSourceRightBreak =
      right.startPosition.row > operator.endPosition.row &&
      (isIndentedExpressionBody(node) ||
        isBlockCombinatorEntry(node) ||
        isOrdinaryBlockResult(node) ||
        isNestedDefinitionBody(node));
    const hasSourceOperatorBreak =
      inlineComments.length === 0 &&
      rightComments.length === 0 &&
      operator.startPosition.row > left.endPosition.row &&
      (isWithinConditionalCondition(node) ||
        isIndentedExpressionBody(node) ||
        isBlockCombinatorEntry(node) ||
        isOrdinaryBlockResult(node) ||
        isNestedDefinitionBody(node));
    const operatorContinuationIndentation = 2;
    return {
      document:
        rightComments.length === 0
          ? hasSourceOperatorBreak
            ? hasSourceRightBreak
              ? concat([
                  leftAnalysis.document,
                  indentBy(
                    concat([hardLine, text(operator.text)]),
                    operatorContinuationIndentation,
                  ),
                  indentBy(concat([hardLine, rightAnalysis.document]), 4),
                ])
              : concat([
                  leftAnalysis.document,
                  indentBy(
                    concat([hardLine, text(`${operator.text} `), rightAnalysis.document]),
                    operatorContinuationIndentation,
                  ),
                ])
            : hasSourceRightBreak
              ? concat([
                  leftAnalysis.document,
                  ...comments,
                  text(` ${operator.text}`),
                  indentBy(concat([hardLine, rightAnalysis.document]), 2),
                ])
              : concat([
                  leftAnalysis.document,
                  ...comments,
                  text(` ${operator.text} `),
                  rightAnalysis.document,
                ])
          : concat([
              leftAnalysis.document,
              ...comments,
              text(` ${operator.text}`),
              ...operatorTrailingComments.flatMap((comment) => [
                text(" "),
                commentDocument(comment),
              ]),
              indent(
                concat([
                  ...rightOperandComments.flatMap((comment) => [
                    hardLine,
                    commentDocument(comment),
                  ]),
                  hardLine,
                  rightAnalysis.document,
                ]),
              ),
            ]),
      binaryOperators: [
        ...leftAnalysis.binaryOperators,
        { node: operator, left, right, inlineComments, rightComments },
        ...rightAnalysis.binaryOperators,
      ],
      unitLiterals: [...leftAnalysis.unitLiterals, ...rightAnalysis.unitLiterals],
      sequenceLiterals: [...leftAnalysis.sequenceLiterals, ...rightAnalysis.sequenceLiterals],
      recordLiterals: [...leftAnalysis.recordLiterals, ...rightAnalysis.recordLiterals],
      callExpressions: [...leftAnalysis.callExpressions, ...rightAnalysis.callExpressions],
    };
  }

  return undefined;
}
