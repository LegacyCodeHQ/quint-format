import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "../../analysis.js";
import { commentDocument } from "../../formatting/comments.js";
import {
  concat,
  type Doc,
  group,
  hardLine,
  indent,
  line,
  renderDoc,
  text,
} from "../../formatting/document.js";

export function analyzeBlockExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type === "block_expression") {
    const bindings = node.childrenForFieldName("binding");
    const expression = node.childForFieldName("expression");
    if (!expression) throw new Error("Unable to locate the block expression");
    const bindingAnalyses = bindings.map((binding) => {
      const name = binding.childForFieldName("name");
      const value = binding.childForFieldName("value");
      if (!name || !value) throw new Error("Unable to locate a nondet binding");
      return { name, value: analyzeExpression(value) };
    });
    const analysis = analyzeExpression(expression);
    const analyses = [...bindingAnalyses.map(({ value }) => value), analysis];
    const contentDocuments: Doc[] = [];
    let previousContent: Parser.SyntaxNode | undefined;
    for (const child of node.namedChildren) {
      if (child.type === "comment" || child.type === "documentation_comment") {
        const isTrailingContentComment =
          previousContent?.endPosition.row === child.startPosition.row;
        if (isTrailingContentComment) {
          const contentDocument = contentDocuments.pop();
          if (!contentDocument || !previousContent) {
            throw new Error("Unable to attach the trailing block content comment");
          }
          const commentGap = node.text.slice(
            previousContent.endIndex - node.startIndex,
            child.startIndex - node.startIndex,
          );
          contentDocuments.push(
            concat([contentDocument, text(commentGap), commentDocument(child)]),
          );
        } else {
          contentDocuments.push(commentDocument(child));
        }
        previousContent = undefined;
        continue;
      }
      if (child.id === expression.id) {
        contentDocuments.push(analysis.document);
        previousContent = child;
        continue;
      }
      const bindingIndex = bindings.findIndex((binding) => binding.id === child.id);
      const binding = bindingAnalyses[bindingIndex];
      if (binding) {
        contentDocuments.push(
          concat([text(`nondet ${binding.name.text} = `), binding.value.document]),
        );
        previousContent = child;
        continue;
      }
      throw new Error("Formatting this block content is not implemented yet");
    }
    return {
      document: concat([
        text("{"),
        indent(concat(contentDocuments.flatMap((document) => [hardLine, document]))),
        hardLine,
        text("}"),
      ]),
      binaryOperators: analyses.flatMap((item) => item.binaryOperators),
      unitLiterals: analyses.flatMap((item) => item.unitLiterals),
      sequenceLiterals: analyses.flatMap((item) => item.sequenceLiterals),
      recordLiterals: analyses.flatMap((item) => item.recordLiterals),
      callExpressions: analyses.flatMap((item) => item.callExpressions),
    };
  }

  if (
    node.type === "any_expression" ||
    node.type === "all_expression" ||
    node.type === "and_block_expression" ||
    node.type === "or_block_expression"
  ) {
    const fieldName =
      node.type === "any_expression"
        ? "choice"
        : node.type === "or_block_expression"
          ? "disjunct"
          : "conjunct";
    const entries = node.childrenForFieldName(fieldName);
    const keyword = node.children.find((child) => ["any", "all", "and", "or"].includes(child.type));
    const openBrace = node.children.find((child) => child.type === "{");
    const closeBrace = [...node.children].reverse().find((child) => child.type === "}");
    if (!keyword || !openBrace || !closeBrace || entries.length === 0) {
      throw new Error("Unable to locate the block combinator entries");
    }
    const openingComment = node.namedChildren.find(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startPosition.row === openBrace.endPosition.row,
    );
    const analyses = entries.map(analyzeExpression);
    const hasComments = node.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
    const compactDocument = concat([
      text(`${keyword.text} { `),
      ...analyses.flatMap((analysis, index) => [
        ...(index === 0 ? [] : [text(", ")]),
        analysis.document,
      ]),
      text(" }"),
    ]);
    const compactText = renderDoc(compactDocument);
    const preservesCompactLayout =
      !hasComments &&
      openBrace.startPosition.row === closeBrace.startPosition.row &&
      entries.every((entry) => entry.startPosition.row === openBrace.startPosition.row) &&
      !compactText.includes("\n") &&
      node.startPosition.column + compactText.length <= 120;
    if (preservesCompactLayout) {
      return {
        document: compactDocument,
        binaryOperators: analyses.flatMap((analysis) => analysis.binaryOperators),
        unitLiterals: analyses.flatMap((analysis) => analysis.unitLiterals),
        sequenceLiterals: analyses.flatMap((analysis) => analysis.sequenceLiterals),
        recordLiterals: analyses.flatMap((analysis) => analysis.recordLiterals),
        callExpressions: analyses.flatMap((analysis) => analysis.callExpressions),
      };
    }
    const contentDocuments: Doc[] = [];
    const contentAnchors: Parser.SyntaxNode[] = [];
    let previousEntry: Parser.SyntaxNode | undefined;
    for (const child of node.namedChildren) {
      if (child.type === "comment" || child.type === "documentation_comment") {
        if (child.id === openingComment?.id) continue;
        const isTrailingEntryComment = previousEntry?.endPosition.row === child.startPosition.row;
        if (isTrailingEntryComment) {
          const entryDocument = contentDocuments.pop();
          const comma = [...node.children]
            .reverse()
            .find(
              (candidate) =>
                candidate.type === "," &&
                candidate.startIndex >= (previousEntry?.endIndex ?? child.startIndex) &&
                candidate.endIndex <= child.startIndex,
            );
          const commentAnchor = comma ?? previousEntry;
          if (!entryDocument || !commentAnchor) {
            throw new Error("Unable to attach the trailing block entry comment");
          }
          const commentGap = node.text.slice(
            commentAnchor.endIndex - node.startIndex,
            child.startIndex - node.startIndex,
          );
          contentDocuments.push(concat([entryDocument, text(commentGap), commentDocument(child)]));
          contentAnchors[contentAnchors.length - 1] = child;
        } else {
          contentDocuments.push(commentDocument(child));
          contentAnchors.push(child);
        }
        continue;
      }
      const entryIndex = entries.findIndex((entry) => entry.id === child.id);
      const entry = analyses[entryIndex];
      if (!entry)
        throw new Error("Formatting this block combinator content is not implemented yet");
      contentDocuments.push(concat([entry.document, text(",")]));
      contentAnchors.push(child);
      previousEntry = child;
    }
    const sourceLineGroups: Array<{
      documents: Doc[];
      firstAnchor: Parser.SyntaxNode;
      lastAnchor: Parser.SyntaxNode;
    }> = [];
    for (const [index, document] of contentDocuments.entries()) {
      const anchor = contentAnchors[index] as Parser.SyntaxNode;
      const previousGroup = sourceLineGroups.at(-1);
      if (previousGroup && anchor.startPosition.row === previousGroup.lastAnchor.endPosition.row) {
        previousGroup.documents.push(document);
        previousGroup.lastAnchor = anchor;
      } else {
        sourceLineGroups.push({
          documents: [document],
          firstAnchor: anchor,
          lastAnchor: anchor,
        });
      }
    }
    const spacedContentDocuments = sourceLineGroups.flatMap((sourceLineGroup, index) => {
      const previous = index === 0 ? keyword : sourceLineGroups[index - 1]?.lastAnchor;
      const lineBreaks =
        index === 0
          ? 1
          : Math.min(
              2,
              Math.max(
                1,
                sourceLineGroup.firstAnchor.startPosition.row - (previous?.endPosition.row ?? 0),
              ),
            );
      const groupedDocument = group(
        concat(
          sourceLineGroup.documents.flatMap((document, documentIndex) => [
            ...(documentIndex === 0 ? [] : [line]),
            document,
          ]),
        ),
      );
      return [...Array.from({ length: lineBreaks }, () => hardLine), groupedDocument];
    });
    return {
      document: concat([
        text(`${keyword.text} {`),
        ...(openingComment ? [text(" "), commentDocument(openingComment)] : []),
        indent(concat(spacedContentDocuments)),
        hardLine,
        text("}"),
      ]),
      binaryOperators: analyses.flatMap((analysis) => analysis.binaryOperators),
      unitLiterals: analyses.flatMap((analysis) => analysis.unitLiterals),
      sequenceLiterals: analyses.flatMap((analysis) => analysis.sequenceLiterals),
      recordLiterals: analyses.flatMap((analysis) => analysis.recordLiterals),
      callExpressions: analyses.flatMap((analysis) => analysis.callExpressions),
    };
  }

  return undefined;
}
