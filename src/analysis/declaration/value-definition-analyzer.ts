import type Parser from "tree-sitter";
import type { ModuleDeclaration } from "../../analysis.js";
import { definitionBodyDocument } from "../../definition-body-formatter.js";
import { formatPattern } from "../../pattern-formatter.js";
import { formatType } from "../../type-formatter.js";
import { analyzeExpression } from "../expression/expression-analyzer.js";

export function analyzeValueDefinition(node: Parser.SyntaxNode): ModuleDeclaration | undefined {
  if (node.type !== "value_definition") return undefined;

  const qualifier = node.childForFieldName("qualifier");
  const keyword = node.children.find((child) => child.type === "val");
  const declarationName = node.childForFieldName("name");
  const declarationType = node.childForFieldName("type");
  const value = node.childForFieldName("value");
  const colon = node.children.find((child) => child.type === ":");
  const equals = node.children.find((child) => child.type === "=");
  const semicolon = node.children.find((child) => child.type === ";");
  if (
    !keyword ||
    !declarationName ||
    !equals ||
    !value ||
    (qualifier && qualifier.type !== "pure") ||
    Boolean(declarationType) !== Boolean(colon)
  ) {
    throw new Error("Formatting this value definition syntax is not implemented yet");
  }

  const expression = analyzeExpression(value);
  const typeAnnotation = declarationType ? `: ${formatType(declarationType)}` : "";
  return {
    node,
    qualifier: qualifier ?? undefined,
    keyword,
    nameNode: declarationName,
    colon: colon ?? undefined,
    typeNode: declarationType ?? undefined,
    typeRoots: declarationType ? [declarationType] : undefined,
    semicolon,
    equals,
    valueNode: value,
    binaryOperators: expression.binaryOperators,
    unitLiterals: expression.unitLiterals,
    sequenceLiterals: expression.sequenceLiterals,
    recordLiterals: expression.recordLiterals,
    callExpressions: expression.callExpressions,
    document: definitionBodyDocument(
      `${qualifier ? "pure " : ""}val ${formatPattern(declarationName)}${typeAnnotation} =`,
      node,
      value,
      expression.document,
    ),
  };
}
