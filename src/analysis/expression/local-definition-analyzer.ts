import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { definitionBodyDocument } from "@/formatting/definition-body-formatter.js";
import { concat, type Doc, text } from "@/formatting/document.js";
import { formatPattern } from "@/formatting/pattern-formatter.js";
import { formatType } from "@/formatting/type-formatter.js";
import { isAlignedLocalTrailingComment } from "@/parsing/syntax.js";

function localTrailingCommentDocuments(
  definition: Parser.SyntaxNode,
  value: Parser.SyntaxNode,
  comments: Parser.SyntaxNode[],
): Doc[] {
  return comments.flatMap((comment) => {
    const gap = isAlignedLocalTrailingComment(definition, comment)
      ? definition.text.slice(
          value.endIndex - definition.startIndex,
          comment.startIndex - definition.startIndex,
        )
      : " ";
    return [text(gap), commentDocument(comment)];
  });
}

export function analyzeLocalDefinition(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis {
  if (node.type === "value_definition") {
    const qualifier = node.childForFieldName("qualifier");
    const name = node.childForFieldName("name");
    const typeNode = node.childForFieldName("type");
    const value = node.childForFieldName("value");
    if (!name || (qualifier && qualifier.type !== "pure")) {
      throw new Error("Unable to locate the local value definition");
    }
    const valueAnalysis = value ? analyzeExpression(value) : undefined;
    const trailingComments = value
      ? node.namedChildren.filter(
          (child) =>
            (child.type === "comment" || child.type === "documentation_comment") &&
            child.startIndex >= value.endIndex,
        )
      : [];
    return {
      document: concat([
        value && valueAnalysis
          ? definitionBodyDocument(
              `${qualifier ? "pure " : ""}val ${formatPattern(name)}${typeNode ? `: ${formatType(typeNode)}` : ""} =`,
              node,
              value,
              valueAnalysis.document,
            )
          : text(
              `${qualifier ? "pure " : ""}val ${formatPattern(name)}${typeNode ? `: ${formatType(typeNode)}` : ""}`,
            ),
        ...(value ? localTrailingCommentDocuments(node, value, trailingComments) : []),
      ]),
      binaryOperators: valueAnalysis?.binaryOperators ?? [],
      unitLiterals: valueAnalysis?.unitLiterals ?? [],
      sequenceLiterals: valueAnalysis?.sequenceLiterals ?? [],
      recordLiterals: valueAnalysis?.recordLiterals ?? [],
      callExpressions: valueAnalysis?.callExpressions ?? [],
    };
  }

  if (node.type === "operator_definition") {
    const qualifier = node.childForFieldName("qualifier");
    const defKeyword = node.children.find((child) => child.type === "def");
    const name = node.childForFieldName("name");
    const parameters = node.childrenForFieldName("parameter");
    const returnType = node.childForFieldName("return_type");
    const body = node.childForFieldName("body");
    if (!name || (!defKeyword && !qualifier)) {
      throw new Error("Unable to locate the local operator definition");
    }
    const bodyAnalysis = body ? analyzeExpression(body) : undefined;
    const trailingComments = body
      ? node.namedChildren.filter(
          (child) =>
            (child.type === "comment" || child.type === "documentation_comment") &&
            child.startIndex >= body.endIndex,
        )
      : [];
    const head = defKeyword ? `${qualifier ? `${qualifier.text} ` : ""}def` : qualifier?.text;
    const parameterList =
      parameters.length > 0
        ? `(${parameters
            .map((parameter) => {
              const parameterName = parameter.childForFieldName("name");
              const parameterType = parameter.childForFieldName("type");
              if (!parameterName) throw new Error("Unable to locate a local operator parameter");
              return `${formatPattern(parameterName)}${parameterType ? `: ${formatType(parameterType)}` : ""}`;
            })
            .join(", ")})`
        : "";
    return {
      document: concat([
        body && bodyAnalysis
          ? definitionBodyDocument(
              `${head} ${name.text}${parameterList}${returnType ? `: ${formatType(returnType)}` : ""} =`,
              node,
              body,
              bodyAnalysis.document,
            )
          : text(
              `${head} ${name.text}${parameterList}${returnType ? `: ${formatType(returnType)}` : ""}`,
            ),
        ...(body ? localTrailingCommentDocuments(node, body, trailingComments) : []),
      ]),
      binaryOperators: bodyAnalysis?.binaryOperators ?? [],
      unitLiterals: bodyAnalysis?.unitLiterals ?? [],
      sequenceLiterals: bodyAnalysis?.sequenceLiterals ?? [],
      recordLiterals: bodyAnalysis?.recordLiterals ?? [],
      callExpressions: bodyAnalysis?.callExpressions ?? [],
    };
  }

  throw new Error("Formatting this local definition syntax is not implemented yet");
}
