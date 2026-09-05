import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { indentBy } from "@/formatting/definition-body-formatter.js";
import { concat, hardLine, text } from "@/formatting/document.js";
import {
  isMultilineParenthesizedPostfixReceiver,
  isMultilineUfcsContinuation,
  ufcsContinuationIndentation,
} from "@/parsing/syntax.js";

export function analyzeAccessExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type === "field_access_expression") {
    const object = node.childForFieldName("object");
    const field = node.childForFieldName("field");
    const dot = node.children.find((child) => child.type === ".");
    if (!object || !field || !dot) {
      throw new Error("Unable to locate the field access operands");
    }
    const analysis = analyzeExpression(object);
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= object.endIndex &&
        child.endIndex <= field.startIndex,
    );
    const isMultilineContinuation =
      isMultilineUfcsContinuation(node) && !isMultilineParenthesizedPostfixReceiver(object);
    return {
      document:
        comments.length === 0
          ? isMultilineContinuation
            ? concat([
                analysis.document,
                indentBy(concat([hardLine, text(`.${field.text}`)]), ufcsContinuationIndentation()),
              ])
            : concat([analysis.document, text(`.${field.text}`)])
          : concat([
              analysis.document,
              indentBy(
                concat([
                  ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  text(`.${field.text}`),
                ]),
                ufcsContinuationIndentation(),
              ),
            ]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  if (node.type === "namespace_access_expression") {
    const namespace = node.childForFieldName("namespace");
    const members = node.childrenForFieldName("member");
    if (!namespace || members.length === 0) {
      throw new Error("Unable to locate the namespace access members");
    }
    return {
      document: text([namespace.text, ...members.map((member) => member.text)].join("::")),
      binaryOperators: [],
      unitLiterals: [],
      sequenceLiterals: [],
      recordLiterals: [],
      callExpressions: [],
    };
  }

  if (node.type === "index_expression") {
    const collection = node.childForFieldName("collection");
    const index = node.childForFieldName("index");
    if (!collection || !index) {
      throw new Error("Unable to locate the index expression operands");
    }
    const collectionAnalysis = analyzeExpression(collection);
    const indexAnalysis = analyzeExpression(index);
    return {
      document: concat([collectionAnalysis.document, text("["), indexAnalysis.document, text("]")]),
      binaryOperators: [...collectionAnalysis.binaryOperators, ...indexAnalysis.binaryOperators],
      unitLiterals: [...collectionAnalysis.unitLiterals, ...indexAnalysis.unitLiterals],
      sequenceLiterals: [...collectionAnalysis.sequenceLiterals, ...indexAnalysis.sequenceLiterals],
      recordLiterals: [...collectionAnalysis.recordLiterals, ...indexAnalysis.recordLiterals],
      callExpressions: [...collectionAnalysis.callExpressions, ...indexAnalysis.callExpressions],
    };
  }

  return undefined;
}
