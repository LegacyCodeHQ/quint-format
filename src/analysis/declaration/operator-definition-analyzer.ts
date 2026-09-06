import type Parser from "tree-sitter";
import { analyzeExpression } from "@/analysis/expression/expression-analyzer.js";
import type { ModuleDeclaration } from "@/core/analysis.js";
import { definitionBodyDocument } from "@/formatting/definition-body-formatter.js";
import { concat, hardLine, indent, text } from "@/formatting/document.js";
import { canFormatType, formatType } from "@/formatting/type-formatter.js";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
import { definitionBody } from "@/parsing/syntax.js";

export function analyzeOperatorDefinition(
  node: Parser.SyntaxNode,
  commentAttachments: CommentAttachmentIndex,
): ModuleDeclaration | undefined {
  if (node.type !== "operator_definition") return undefined;

  const defKeyword = node.children.find((child) => child.type === "def");
  const qualifier = node.childForFieldName("qualifier");
  const isPureDefinition = defKeyword && (!qualifier || qualifier.type === "pure");
  const isStandaloneDefinition =
    !defKeyword &&
    (qualifier?.type === "action" ||
      qualifier?.type === "run" ||
      qualifier?.type === "temporal" ||
      qualifier?.type === "nondet");
  const keyword = isPureDefinition ? defKeyword : isStandaloneDefinition ? qualifier : undefined;
  const declarationName = node.childForFieldName("name");
  const parameters = node.childrenForFieldName("parameter");
  const openParen = node.children.find((child) => child.type === "(");
  const closeParen = node.children.find((child) => child.type === ")");
  const parameterCommas = node.children.filter((child) => child.type === ",");
  const returnType = node.childForFieldName("return_type");
  const returnColon = node.children.find((child) => child.type === ":");
  const semicolon = node.children.find((child) => child.type === ";");
  const body = definitionBody(node);
  const equals = node.children.find((child) => child.type === "=");
  const parameterNames = parameters.map((parameter) => parameter.childForFieldName("name"));
  const parameterTypes = parameters.map((parameter) => parameter.childForFieldName("type"));
  const parameterColons = parameters.map((parameter) =>
    parameter.children.find((child) => child.type === ":"),
  );
  const parametersAreUntyped = parameterTypes.every(
    (parameterType, index) => !parameterType && !parameterColons[index],
  );
  const parametersAreTyped = parameterTypes.every(
    (parameterType, index) =>
      Boolean(parameterType && canFormatType(parameterType)) && Boolean(parameterColons[index]),
  );
  const hasSupportedParameters =
    parameters.length === 0
      ? (!openParen && !closeParen) || Boolean(openParen && closeParen)
      : Boolean(openParen) &&
        Boolean(closeParen) &&
        (parameterCommas.length === parameters.length - 1 ||
          parameterCommas.length === parameters.length) &&
        parameterNames.every(
          (parameterName) => parameterName?.type === "identifier" || parameterName?.type === "hole",
        ) &&
        (parametersAreUntyped || parametersAreTyped);
  const hasSupportedReturnType = returnType
    ? canFormatType(returnType) &&
      Boolean(returnColon) &&
      (parametersAreTyped || parametersAreUntyped)
    : !returnColon && parametersAreUntyped;
  if (
    !keyword ||
    !declarationName ||
    !equals ||
    !body ||
    !hasSupportedParameters ||
    !hasSupportedReturnType ||
    (!isPureDefinition && !isStandaloneDefinition)
  ) {
    throw new Error("Formatting this operator definition syntax is not implemented yet");
  }

  const expression = analyzeExpression(body, commentAttachments);
  const definitionHead = isStandaloneDefinition
    ? qualifier.text
    : `${qualifier ? `${qualifier.text} ` : ""}def`;
  const formattedParameters = parameterNames.map((parameterName, index) => {
    const parameterType = parameterTypes[index];
    return `${parameterName?.text}${parameterType ? `: ${formatType(parameterType)}` : ""}`;
  });
  const lastParameter = parameters.at(-1);
  const hasTrailingParameterComma = Boolean(
    lastParameter && parameterCommas.some((comma) => comma.startIndex >= lastParameter.endIndex),
  );
  const parameterList =
    openParen && closeParen
      ? `(${formattedParameters.join(", ")}${hasTrailingParameterComma ? "," : ""})`
      : "";
  const typeAnchor = closeParen ?? declarationName;
  const lineBrokenTypeAnnotation = Boolean(
    returnColon && returnColon.startPosition.row > typeAnchor.endPosition.row,
  );
  const returnTypeDocuments = returnType
    ? [...(lineBrokenTypeAnnotation ? [hardLine] : []), text(`: ${formatType(returnType)}`)]
    : [];
  const usesExpandedParameterList = Boolean(
    openParen &&
      closeParen &&
      parameters.length > 0 &&
      openParen.startPosition.row < closeParen.endPosition.row,
  );
  const definitionHeadDocument = usesExpandedParameterList
    ? concat([
        text(`${definitionHead} ${declarationName.text}(`),
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
    : concat([
        text(`${definitionHead} ${declarationName.text}${parameterList}`),
        ...returnTypeDocuments,
        text(" ="),
      ]);
  return {
    node,
    qualifier: isPureDefinition ? (qualifier ?? undefined) : undefined,
    keyword,
    nameNode: declarationName,
    colon: returnColon,
    typeNode: returnType ?? undefined,
    typeAnchor,
    lineBrokenTypeAnnotation,
    typeRoots: [
      ...parameterTypes.filter((type) => type !== null),
      ...(returnType ? [returnType] : []),
    ],
    openParen,
    closeParen,
    parameters,
    parameterCommas,
    expandedParameterList: usesExpandedParameterList,
    semicolon,
    equals,
    valueNode: body,
    binaryOperators: expression.binaryOperators,
    unitLiterals: expression.unitLiterals,
    sequenceLiterals: expression.sequenceLiterals,
    recordLiterals: expression.recordLiterals,
    callExpressions: expression.callExpressions,
    document: definitionBodyDocument(
      definitionHeadDocument,
      node,
      body,
      expression.document,
      1,
      commentAttachments,
    ),
  };
}
