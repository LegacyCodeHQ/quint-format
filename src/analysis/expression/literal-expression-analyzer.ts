import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { concat, type Doc, group, hardLine, indent, line, text } from "@/formatting/document.js";

export function analyzeLiteralExpression(
  node: Parser.SyntaxNode,
  trailingClosingComment: Parser.SyntaxNode | undefined,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
  analyzeExpressionWithClosingComment: (
    node: Parser.SyntaxNode,
    trailingClosingComment?: Parser.SyntaxNode,
  ) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (
    node.type === "integer_literal" ||
    node.type === "boolean_literal" ||
    node.type === "string_literal" ||
    node.type === "name_reference" ||
    node.type === "reserved_operator"
  ) {
    return {
      document: text(node.text),
      binaryOperators: [],
      unitLiterals: [],
      sequenceLiterals: [],
      recordLiterals: [],
      callExpressions: [],
    };
  }

  if (node.type === "unit_literal") {
    return {
      document: text("()"),
      binaryOperators: [],
      unitLiterals: [node],
      sequenceLiterals: [],
      recordLiterals: [],
      callExpressions: [],
    };
  }

  if (node.type === "list_literal" || node.type === "tuple_literal") {
    const elements = node.childrenForFieldName("element");
    const analyses = elements.map(analyzeExpression);
    const [openDelimiter, closeDelimiter] = node.type === "list_literal" ? ["[", "]"] : ["(", ")"];
    const openDelimiterNode = node.children.find((child) => child.type === openDelimiter);
    const closeDelimiterNode = [...node.children]
      .reverse()
      .find((child) => child.type === closeDelimiter);
    const firstElement = elements[0];
    const lastElement = elements.at(-1);
    const isExpandedList = Boolean(
      node.type === "list_literal" &&
        openDelimiterNode &&
        closeDelimiterNode &&
        firstElement &&
        lastElement &&
        firstElement.startPosition.row > openDelimiterNode.endPosition.row &&
        closeDelimiterNode.startPosition.row > lastElement.endPosition.row,
    );
    const elementDocuments = analyses.flatMap((analysis, index) => {
      const element = elements[index] as Parser.SyntaxNode;
      const previous = elements[index - 1];
      const startsOnNewLine = index === 0 || element.startPosition.row > previous.endPosition.row;
      return [
        ...(index > 0 ? [text(",")] : []),
        ...(startsOnNewLine ? [hardLine] : index > 0 ? [text(" ")] : []),
        analysis.document,
      ];
    });
    return {
      document: isExpandedList
        ? concat([
            text(openDelimiter),
            indent(concat(elementDocuments)),
            hardLine,
            text(closeDelimiter),
          ])
        : concat([
            text(openDelimiter),
            ...analyses.flatMap((analysis, index) => [
              ...(index === 0 ? [] : [text(", ")]),
              analysis.document,
            ]),
            text(closeDelimiter),
          ]),
      binaryOperators: analyses.flatMap((analysis) => analysis.binaryOperators),
      unitLiterals: analyses.flatMap((analysis) => analysis.unitLiterals),
      sequenceLiterals: [node, ...analyses.flatMap((analysis) => analysis.sequenceLiterals)],
      recordLiterals: analyses.flatMap((analysis) => analysis.recordLiterals),
      callExpressions: analyses.flatMap((analysis) => analysis.callExpressions),
    };
  }

  if (node.type === "record_literal") {
    const directElements = node.namedChildren.filter(
      (child) => child.type === "record_literal_field" || child.type === "record_spread",
    );
    const reattachedComments = new Map<number, Parser.SyntaxNode>();
    const reattachedCommentIds = new Set<number>();
    for (const comment of node.namedChildren.filter(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    )) {
      const previousElement = [...directElements]
        .reverse()
        .find((element) => element.endIndex <= comment.startIndex);
      const value = previousElement?.childForFieldName("value");
      const nestedElements = value?.namedChildren.filter(
        (child) => child.type === "record_literal_field" || child.type === "record_spread",
      );
      const lastNestedElement = nestedElements?.at(-1);
      if (
        previousElement &&
        value?.type === "record_literal" &&
        lastNestedElement?.endPosition.row === comment.startPosition.row &&
        value.endPosition.row === comment.startPosition.row
      ) {
        reattachedComments.set(previousElement.id, comment);
        reattachedCommentIds.add(comment.id);
      }
    }
    const entries: Array<{
      node: Parser.SyntaxNode;
      document: Doc;
      analysis?: ExpressionAnalysis;
    }> = node.namedChildren.flatMap((element) => {
      if (reattachedCommentIds.has(element.id)) return [];
      if (element.type === "comment" || element.type === "documentation_comment") {
        return [{ node: element, document: commentDocument(element) }];
      }
      const value = element.childForFieldName("value");
      if (!value) {
        throw new Error("Unable to locate a record literal element value");
      }
      const analysis = analyzeExpressionWithClosingComment(
        value,
        reattachedComments.get(element.id),
      );
      if (element.type === "record_spread") {
        return [{ node: element, document: concat([text("..."), analysis.document]), analysis }];
      }
      const name = element.childForFieldName("name");
      if (element.type !== "record_literal_field" || !name) {
        throw new Error("Formatting this record literal element is not implemented yet");
      }
      return [
        {
          node: element,
          document: concat([text(`${name.text}: `), analysis.document]),
          analysis,
        },
      ];
    });
    const analyses = entries.flatMap((entry) => (entry.analysis ? [entry.analysis] : []));
    const hasComments =
      Boolean(trailingClosingComment) ||
      entries.some(
        ({ node: entry }) => entry.type === "comment" || entry.type === "documentation_comment",
      );
    const isExpanded = hasComments || node.startPosition.row < node.endPosition.row;
    const lineDocuments: Doc[] = [];
    const lineAnchors: Parser.SyntaxNode[] = [];
    if (isExpanded) {
      for (const [index, entry] of entries.entries()) {
        const isComment =
          entry.node.type === "comment" || entry.node.type === "documentation_comment";
        const previous = entries[index - 1];
        const isTrailingComment =
          isComment &&
          previous?.analysis &&
          previous.node.endPosition.row === entry.node.startPosition.row;
        if (isTrailingComment) {
          const previousDocument = lineDocuments.pop();
          if (!previousDocument) throw new Error("Unable to attach the record comment");
          lineDocuments.push(concat([previousDocument, text(" "), entry.document]));
          lineAnchors[lineAnchors.length - 1] = entry.node;
        } else {
          const hasFollowingElement = directElements.some(
            (candidate) => candidate.startIndex > entry.node.endIndex,
          );
          const attachesClosingComment =
            !isComment &&
            Boolean(trailingClosingComment) &&
            !entries.slice(index + 1).some((candidate) => candidate.analysis);
          lineDocuments.push(
            isComment
              ? entry.document
              : concat([
                  entry.document,
                  ...(hasFollowingElement ? [text(",")] : []),
                  ...(attachesClosingComment && trailingClosingComment
                    ? [text(" "), commentDocument(trailingClosingComment)]
                    : []),
                ]),
          );
          lineAnchors.push(
            attachesClosingComment && trailingClosingComment ? trailingClosingComment : entry.node,
          );
        }
      }
    }
    const sourceLineGroups: Array<{
      documents: Doc[];
      lastAnchor: Parser.SyntaxNode;
    }> = [];
    for (const [index, document] of lineDocuments.entries()) {
      const anchor = lineAnchors[index] as Parser.SyntaxNode;
      const previousGroup = sourceLineGroups.at(-1);
      if (previousGroup && anchor.startPosition.row === previousGroup.lastAnchor.endPosition.row) {
        previousGroup.documents.push(document);
        previousGroup.lastAnchor = anchor;
      } else {
        sourceLineGroups.push({ documents: [document], lastAnchor: anchor });
      }
    }
    const groupedLineDocuments = sourceLineGroups.map(({ documents }) =>
      group(
        concat(documents.flatMap((document, index) => [...(index === 0 ? [] : [line]), document])),
      ),
    );
    return {
      document: isExpanded
        ? concat([
            text("{"),
            indent(concat(groupedLineDocuments.flatMap((document) => [hardLine, document]))),
            hardLine,
            text("}"),
          ])
        : concat([
            text("{ "),
            ...entries.flatMap(({ document }, index) => [
              ...(index === 0 ? [] : [text(", ")]),
              document,
            ]),
            text(" }"),
          ]),
      binaryOperators: analyses.flatMap((analysis) => analysis.binaryOperators),
      unitLiterals: analyses.flatMap((analysis) => analysis.unitLiterals),
      sequenceLiterals: analyses.flatMap((analysis) => analysis.sequenceLiterals),
      recordLiterals: [node, ...analyses.flatMap((analysis) => analysis.recordLiterals)],
      callExpressions: analyses.flatMap((analysis) => analysis.callExpressions),
    };
  }

  return undefined;
}
