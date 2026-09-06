import type Parser from "tree-sitter";
import { analyzeExpression } from "@/analysis/expression/expression-analyzer.js";
import type { ModuleDeclaration } from "@/core/analysis.js";
import { definitionBodyDocument } from "@/formatting/definition-body-formatter.js";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";

export function analyzeAssumptionDeclaration(
  node: Parser.SyntaxNode,
  commentAttachments: CommentAttachmentIndex,
): ModuleDeclaration | undefined {
  if (node.type !== "assumption_declaration") return undefined;

  const keyword = node.children.find((child) => child.type === "assume");
  const declarationName = node.childForFieldName("name");
  const condition = node.childForFieldName("condition");
  const equals = node.children.find((child) => child.type === "=");
  if (!keyword || !declarationName || !equals || !condition) {
    throw new Error("Formatting this assumption syntax is not implemented yet");
  }

  const expression = analyzeExpression(condition, commentAttachments);
  return {
    node,
    keyword,
    nameNode: declarationName,
    equals,
    valueNode: condition,
    binaryOperators: expression.binaryOperators,
    unitLiterals: expression.unitLiterals,
    sequenceLiterals: expression.sequenceLiterals,
    recordLiterals: expression.recordLiterals,
    callExpressions: expression.callExpressions,
    document: definitionBodyDocument(
      `assume ${declarationName.text} =`,
      node,
      condition,
      expression.document,
      2,
    ),
  };
}
