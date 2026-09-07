import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import {
  definitionBodyContinuationIndentation,
  definitionBodyDocument,
} from "@/formatting/definition-body-formatter.js";
import { concat, type Doc, hardLine, indent, text } from "@/formatting/document.js";
import { formatPattern } from "@/formatting/pattern-formatter.js";
import { formatType } from "@/formatting/type-formatter.js";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
import { definitionBody } from "@/parsing/syntax.js";

function localTrailingCommentDocuments(
  definition: Parser.SyntaxNode,
  value: Parser.SyntaxNode,
  comments: Parser.SyntaxNode[],
  commentAttachments: CommentAttachmentIndex,
): Doc[] {
  return comments.flatMap((comment) => {
    const gap = commentAttachments.isAlignedLocalTrailingComment(comment)
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
  commentAttachments: CommentAttachmentIndex,
): ExpressionAnalysis {
  if (node.type === "value_definition") {
    const qualifier = node.childForFieldName("qualifier");
    const name = node.childForFieldName("name");
    const typeNode = node.childForFieldName("type");
    const value = definitionBody(node);
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
              definitionBodyContinuationIndentation(node, value, commentAttachments),
              commentAttachments,
            )
          : text(
              `${qualifier ? "pure " : ""}val ${formatPattern(name)}${typeNode ? `: ${formatType(typeNode)}` : ""}`,
            ),
        ...(value
          ? localTrailingCommentDocuments(node, value, trailingComments, commentAttachments)
          : []),
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
    const parameterCommas = node.children.filter((child) => child.type === ",");
    const openParen = node.children.find((child) => child.type === "(");
    const closeParen = node.children.find((child) => child.type === ")");
    const returnType = node.childForFieldName("return_type");
    const returnColon = node.children.find((child) => child.type === ":");
    const body = definitionBody(node);
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
    const formattedParameters = parameters.map((parameter) => {
      const parameterName = parameter.childForFieldName("name");
      const parameterType = parameter.childForFieldName("type");
      if (!parameterName) throw new Error("Unable to locate a local operator parameter");
      return `${formatPattern(parameterName)}${parameterType ? `: ${formatType(parameterType)}` : ""}`;
    });
    const lastParameter = parameters.at(-1);
    const hasTrailingParameterComma = Boolean(
      lastParameter && parameterCommas.some((comma) => comma.startIndex >= lastParameter.endIndex),
    );
    const usesExpandedParameterList = Boolean(
      openParen &&
        closeParen &&
        parameters.length > 0 &&
        openParen.startPosition.row < closeParen.endPosition.row,
    );
    const parameterList =
      openParen && closeParen
        ? `(${formattedParameters.join(", ")}${hasTrailingParameterComma ? "," : ""})`
        : "";
    const typeAnchor = closeParen ?? name;
    const lineBrokenTypeAnnotation = Boolean(
      returnColon && returnColon.startPosition.row > typeAnchor.endPosition.row,
    );
    const returnTypeDocuments = returnType
      ? [...(lineBrokenTypeAnnotation ? [hardLine] : []), text(`: ${formatType(returnType)}`)]
      : [];
    const definitionHeadDocument = usesExpandedParameterList
      ? concat([
          text(`${head} ${name.text}(`),
          indent(
            concat(
              formattedParameters.flatMap((parameter, index) => [
                hardLine,
                text(
                  `${parameter}${index < formattedParameters.length - 1 || hasTrailingParameterComma ? "," : ""}`,
                ),
              ]),
            ),
          ),
          hardLine,
          text(")"),
          ...returnTypeDocuments,
          text(" ="),
        ])
      : concat([text(`${head} ${name.text}${parameterList}`), ...returnTypeDocuments, text(" =")]);
    return {
      document: concat([
        body && bodyAnalysis
          ? definitionBodyDocument(
              definitionHeadDocument,
              node,
              body,
              bodyAnalysis.document,
              definitionBodyContinuationIndentation(node, body, commentAttachments),
              commentAttachments,
            )
          : text(
              `${head} ${name.text}${parameterList}${returnType ? `: ${formatType(returnType)}` : ""}`,
            ),
        ...(body
          ? localTrailingCommentDocuments(node, body, trailingComments, commentAttachments)
          : []),
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
