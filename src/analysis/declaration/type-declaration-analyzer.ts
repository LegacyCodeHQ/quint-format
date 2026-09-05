import type Parser from "tree-sitter";
import type { ModuleDeclaration } from "../../analysis.js";
import { commentDocument } from "../../comments.js";
import { concat, type Doc, hardLine, indent, text } from "../../document.js";
import { formatExpandedRecordType } from "../../record-type-formatter.js";
import { formatSumVariant, formatType } from "../../type-formatter.js";

export function analyzeTypeDeclaration(node: Parser.SyntaxNode): ModuleDeclaration | undefined {
  if (node.type === "uninterpreted_type_declaration") {
    return analyzeUninterpretedTypeDeclaration(node);
  }
  if (node.type !== "type_alias_declaration") return undefined;

  const keyword = node.children.find((child) => child.type === "type");
  const declarationName = node.childForFieldName("name");
  const value = node.childForFieldName("value");
  const equals = node.children.find((child) => child.type === "=");
  const typeParameters = node.childrenForFieldName("parameter");
  const typeOpenBracket = node.children.find((child) => child.type === "[");
  const typeCloseBracket = node.children.find((child) => child.type === "]");
  const typeParameterCommas = node.children.filter((child) => child.type === ",");
  const typeParameterNames = typeParameters.map((parameter) => parameter.childForFieldName("name"));
  const hasSupportedTypeParameters =
    typeParameters.length === 0
      ? !typeOpenBracket && !typeCloseBracket
      : Boolean(typeOpenBracket) &&
        Boolean(typeCloseBracket) &&
        typeParameterCommas.length === typeParameters.length - 1 &&
        typeParameterNames.every((name) => name?.type === "type_variable");
  if (!keyword || !declarationName || !value || !hasSupportedTypeParameters || !equals) {
    throw new Error("Formatting this type alias syntax is not implemented yet");
  }

  const typeParameterList =
    typeParameterNames.length > 0
      ? `[${typeParameterNames.map((name) => name?.text).join(", ")}]`
      : "";
  const isMultilineSumType =
    value.type === "sum_type" && value.startPosition.row < value.endPosition.row;
  const sumEntries: Doc[] = [];
  if (isMultilineSumType) {
    let previousVariant: Parser.SyntaxNode | undefined;
    for (const child of value.namedChildren) {
      if (child.type === "sum_type_variant") {
        sumEntries.push(text(`| ${formatSumVariant(child)}`));
        previousVariant = child;
        continue;
      }
      if (child.type === "comment" || child.type === "documentation_comment") {
        const isTrailingVariantComment =
          previousVariant?.endPosition.row === child.startPosition.row;
        if (isTrailingVariantComment) {
          const variantDocument = sumEntries.pop();
          if (!variantDocument) {
            throw new Error("Unable to attach the trailing sum variant comment");
          }
          const commentGap = value.text.slice(
            (previousVariant?.endIndex ?? child.startIndex) - value.startIndex,
            child.startIndex - value.startIndex,
          );
          sumEntries.push(concat([variantDocument, text(commentGap), commentDocument(child)]));
        } else {
          sumEntries.push(commentDocument(child));
        }
        continue;
      }
      throw new Error("Formatting this multiline sum type syntax is not implemented yet");
    }
  }
  const hasRecordComments =
    value.type === "record_type" &&
    value.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
  const isMultilineRecordType =
    value.type === "record_type" && value.startPosition.row < value.endPosition.row;
  const aliasDocument = isMultilineSumType
    ? concat([
        text(`type ${declarationName.text}${typeParameterList} =`),
        indent(concat(sumEntries.flatMap((entry) => [hardLine, entry]))),
      ])
    : hasRecordComments || isMultilineRecordType
      ? concat([
          text(`type ${declarationName.text}${typeParameterList} = `),
          formatExpandedRecordType(value),
        ])
      : text(`type ${declarationName.text}${typeParameterList} = ${formatType(value)}`);

  return {
    node,
    keyword,
    nameNode: declarationName,
    typeOpenBracket,
    typeCloseBracket,
    typeParameters,
    typeParameterCommas,
    equals,
    valueNode: value,
    typeRoots: [value],
    document: aliasDocument,
  };
}

function analyzeUninterpretedTypeDeclaration(node: Parser.SyntaxNode): ModuleDeclaration {
  const keyword = node.children.find((child) => child.type === "type");
  const declarationName = node.childForFieldName("name");
  if (!keyword || !declarationName) {
    throw new Error("Formatting this uninterpreted type syntax is not implemented yet");
  }

  return {
    node,
    keyword,
    nameNode: declarationName,
    document: text(`type ${declarationName.text}`),
  };
}
