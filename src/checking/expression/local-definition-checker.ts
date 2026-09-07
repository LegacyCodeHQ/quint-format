import type Parser from "tree-sitter";
import { checkTypeDelimiterSpacing } from "@/checking/type/type-checker.js";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import {
  definitionBodyContinuationIndentation,
  preservesDefinitionBodyLineBreak,
} from "@/formatting/definition-body-formatter.js";
import type { CommentAttachmentIndex } from "@/parsing/comment-attachments.js";
import { definitionBody, isCompactNondetSequence } from "@/parsing/syntax.js";
import { checkPatternSpacing } from "./pattern-checker.js";

export function checkLocalDefinition(
  node: Parser.SyntaxNode,
  source: string,
  lines: string[],
  filePath: string,
  diagnostics: FormatDiagnostic[],
  commentAttachments: CommentAttachmentIndex,
) {
  const qualifier = node.childForFieldName("qualifier");
  const keyword =
    node.children.find((child) => child.type === "val" || child.type === "def") ?? qualifier;
  const name = node.childForFieldName("name");
  if (!keyword || !name) throw new Error("Unable to locate the local definition header");

  if (qualifier && qualifier.id !== keyword.id) {
    const gap = source.slice(qualifier.endIndex, keyword.startIndex);
    if (gap !== " ") {
      const row = qualifier.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: qualifier.endPosition.column + 1,
        length: Math.max(1, gap.length),
        rule: "format/qualifier-spacing",
        message: `expected one space after '${qualifier.text}'`,
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const keywordGap = source.slice(keyword.endIndex, name.startIndex);
  if (keywordGap !== " ") {
    const row = keyword.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: keyword.endPosition.column + 1,
      length: Math.max(1, keywordGap.length),
      rule: "format/declaration-keyword-spacing",
      message: `expected one space after '${keyword.text}'`,
      sourceLine: lines[row] ?? "",
    });
  }

  const parameters = node.childrenForFieldName("parameter");
  const openParen = node.children.find((child) => child.type === "(");
  const closeParen = node.children.find((child) => child.type === ")");
  const usesExpandedParameterList = Boolean(
    openParen &&
      closeParen &&
      parameters.length > 0 &&
      openParen.startPosition.row < closeParen.endPosition.row,
  );
  if (openParen && closeParen && parameters.length > 0) {
    const first = parameters[0] as Parser.SyntaxNode;
    const last = parameters.at(-1) as Parser.SyntaxNode;
    if (source.slice(name.endIndex, openParen.startIndex) !== "") {
      const row = openParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: name.endPosition.column + 1,
        length: 1,
        rule: "format/parameter-list-spacing",
        message: "expected no space before '('",
        sourceLine: lines[row] ?? "",
      });
    }
    if (
      !usesExpandedParameterList &&
      (source.slice(openParen.endIndex, first.startIndex) !== "" ||
        source.slice(last.endIndex, closeParen.startIndex) !== "")
    ) {
      const row = openParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.endPosition.column + 1,
        length: 1,
        rule: "format/parameter-list-spacing",
        message: "expected no space inside parameter-list parentheses",
        sourceLine: lines[row] ?? "",
      });
    }
    for (const [index, comma] of node.children.filter((child) => child.type === ",").entries()) {
      const previous = parameters[index];
      const next = parameters[index + 1];
      if (
        !usesExpandedParameterList &&
        previous &&
        next &&
        (source.slice(previous.endIndex, comma.startIndex) !== "" ||
          source.slice(comma.endIndex, next.startIndex) !== " ")
      ) {
        const row = comma.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: comma.startPosition.column + 1,
          length: 1,
          rule: "format/parameter-separator-spacing",
          message: "expected ', ' between parameters",
          sourceLine: lines[row] ?? "",
        });
      }
    }
    if (usesExpandedParameterList) {
      const expectedParameterColumn = node.startPosition.column + 2;
      const parametersAreAligned = parameters.every(
        (parameter) => parameter.startPosition.column === expectedParameterColumn,
      );
      if (
        first.startPosition.row !== openParen.endPosition.row + 1 ||
        !parametersAreAligned ||
        closeParen.startPosition.row !== last.endPosition.row + 1 ||
        closeParen.startPosition.column !== node.startPosition.column
      ) {
        const row = first.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: first.startPosition.column + 1,
          length: Math.max(1, first.text.length),
          rule: "format/multiline-parameter-layout",
          message: "expected one local parameter per indented line",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }

  for (const parameter of parameters) {
    const parameterName = parameter.childForFieldName("name");
    const parameterType = parameter.childForFieldName("type");
    const colon = parameter.children.find((child) => child.type === ":");
    if (
      parameterName &&
      parameterType &&
      colon &&
      (source.slice(parameterName.endIndex, colon.startIndex) !== "" ||
        source.slice(colon.endIndex, parameterType.startIndex) !== " ")
    ) {
      const row = colon.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: colon.startPosition.column + 1,
        length: 1,
        rule: "format/type-colon-spacing",
        message: "expected ': ' in parameter annotations",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const typeNode = node.childForFieldName(
    node.type === "operator_definition" ? "return_type" : "type",
  );
  const colon = node.children.find((child) => child.type === ":");
  const typeAnchor = closeParen ?? name;
  const lineBrokenTypeAnnotation = Boolean(
    colon && colon.startPosition.row > typeAnchor.endPosition.row,
  );
  const hasCanonicalColonGap = lineBrokenTypeAnnotation
    ? /^(?:\r\n|\r|\n)[\t ]*$/.test(source.slice(typeAnchor.endIndex, colon?.startIndex)) &&
      colon?.startPosition.column === node.startPosition.column
    : source.slice(typeAnchor.endIndex, colon?.startIndex) === "";
  if (
    typeNode &&
    colon &&
    (!hasCanonicalColonGap || source.slice(colon.endIndex, typeNode.startIndex) !== " ")
  ) {
    const row = colon.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: colon.startPosition.column + 1,
      length: 1,
      rule: "format/type-colon-spacing",
      message: lineBrokenTypeAnnotation
        ? "expected return type on the next aligned line"
        : "expected ': ' before the definition type",
      sourceLine: lines[row] ?? "",
    });
  }

  const value = definitionBody(node);
  const equals = node.children.find((child) => child.type === "=");
  if (value && equals) {
    const anchor = typeNode ?? closeParen ?? name;
    const afterEquals = source.slice(equals.endIndex, value.startIndex);
    const requiresLineBreakAfterEquals = preservesDefinitionBodyLineBreak(
      node,
      value,
      commentAttachments,
    );
    if (
      source.slice(anchor.endIndex, equals.startIndex) !== " " ||
      (requiresLineBreakAfterEquals
        ? !/^(?:\r\n|\r|\n)[\t ]*$/.test(afterEquals)
        : afterEquals !== " ")
    ) {
      const row = equals.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: equals.startPosition.column + 1,
        length: 1,
        rule: "format/equals-spacing",
        message: "expected one space around '='",
        sourceLine: lines[row] ?? "",
      });
    }
    if (
      (node.type === "operator_definition" || node.type === "value_definition") &&
      definitionBodyContinuationIndentation(node, value, commentAttachments) === 2 &&
      value.startPosition.column !== node.startPosition.column + 4
    ) {
      const row = value.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, value.startPosition.column),
        rule: "format/definition-body-indentation",
        message: "expected a four-space continuation indent",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const semicolon = node.children.find((child) => child.type === ";");
  const nestedBody =
    node.parent?.type === "nested_definition_expression"
      ? node.parent.childForFieldName("body")
      : null;
  if (semicolon && !(nestedBody && isCompactNondetSequence(node, nestedBody))) {
    const row = semicolon.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: semicolon.startPosition.column + 1,
      length: 1,
      rule: "format/unnecessary-semicolon",
      message: "optional semicolons are omitted",
      sourceLine: lines[row] ?? "",
    });
  }

  if (typeNode) checkTypeDelimiterSpacing(typeNode, source, lines, filePath, diagnostics);
  for (const parameter of parameters) {
    const parameterType = parameter.childForFieldName("type");
    if (parameterType)
      checkTypeDelimiterSpacing(parameterType, source, lines, filePath, diagnostics);
  }
  checkPatternSpacing(name, source, lines, filePath, diagnostics);
}
