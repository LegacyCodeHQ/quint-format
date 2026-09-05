import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "../../analysis.js";
import { commentDocument } from "../../formatting/comments.js";
import { concat, type Doc, hardLine, indent, text } from "../../formatting/document.js";
import { isCompactDefaultMatch } from "../../syntax.js";

export function analyzeMatchExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (node.type === "match_expression") {
    const value = node.childForFieldName("value");
    const arms = node.childrenForFieldName("arm");
    if (!value || arms.length === 0) {
      throw new Error("Unable to locate the match value or arms");
    }
    const valueAnalysis = analyzeExpression(value);
    const armAnalyses = arms.map((arm) => {
      const variant = arm.childForFieldName("variant");
      const parameter = arm.childForFieldName("parameter");
      const body = arm.childForFieldName("body");
      const arrow = arm.children.find((child) => child.type === "=>");
      if (!variant || !body || !arrow) throw new Error("Unable to locate a match arm");
      const bodyAnalysis = analyzeExpression(body);
      const comments = arm.namedChildren.filter(
        (child) =>
          (child.type === "comment" || child.type === "documentation_comment") &&
          child.endIndex <= body.startIndex,
      );
      const inlineArrowComment = comments.find(
        (comment) => comment.startPosition.row === arrow.endPosition.row,
      );
      const leadingBodyComments = comments.filter(
        (comment) => comment.id !== inlineArrowComment?.id,
      );
      const pattern = `${variant.text}${parameter ? `(${parameter.text})` : ""}`;
      const rawArrowGap =
        arm.text.slice(0, arrow.startIndex - arm.startIndex).match(/[\t ]*$/u)?.[0] ?? "";
      const arrowGap = /^ +$/u.test(rawArrowGap) ? rawArrowGap : " ";
      const isMultilineBody = body.startPosition.row > arrow.endPosition.row;
      return {
        node: arm,
        body: bodyAnalysis,
        document: inlineArrowComment
          ? concat([
              text(`| ${pattern}${arrowGap}=>`),
              text(
                arm.text.slice(
                  arrow.endIndex - arm.startIndex,
                  inlineArrowComment.startIndex - arm.startIndex,
                ),
              ),
              commentDocument(inlineArrowComment),
              indent(
                concat([
                  ...leadingBodyComments.flatMap((comment) => [
                    hardLine,
                    indent(commentDocument(comment)),
                  ]),
                  hardLine,
                  indent(bodyAnalysis.document),
                ]),
              ),
            ])
          : comments.length === 0
            ? isMultilineBody
              ? concat([
                  text(`| ${pattern}${arrowGap}=>`),
                  indent(concat([hardLine, indent(bodyAnalysis.document)])),
                ])
              : concat([text(`| ${pattern}${arrowGap}=> `), indent(bodyAnalysis.document)])
            : concat([
                text(`| ${pattern}${arrowGap}=>`),
                indent(
                  concat([
                    ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                    hardLine,
                    bodyAnalysis.document,
                  ]),
                ),
              ]),
      };
    });
    const analyses = [valueAnalysis, ...armAnalyses.map(({ body }) => body)];
    const compactDefaultMatch = isCompactDefaultMatch(node);
    const contentDocuments: Doc[] = [];
    let previousArm: (typeof armAnalyses)[number] | undefined;
    for (const child of node.namedChildren.filter((candidate) => candidate.id !== value.id)) {
      if (child.type === "comment" || child.type === "documentation_comment") {
        const isTrailingArmComment = previousArm?.node.endPosition.row === child.startPosition.row;
        if (isTrailingArmComment) {
          const armDocument = contentDocuments.pop();
          if (!armDocument || !previousArm) {
            throw new Error("Unable to attach the trailing match-arm comment");
          }
          const commentGap = node.text.slice(
            previousArm.node.endIndex - node.startIndex,
            child.startIndex - node.startIndex,
          );
          contentDocuments.push(concat([armDocument, text(commentGap), commentDocument(child)]));
        } else {
          contentDocuments.push(commentDocument(child));
        }
        continue;
      }
      const arm = armAnalyses.find((analysis) => analysis.node.id === child.id);
      if (!arm) throw new Error("Formatting this match content is not implemented yet");
      contentDocuments.push(arm.document);
      previousArm = arm;
    }
    return {
      document: compactDefaultMatch
        ? concat([
            text("match "),
            valueAnalysis.document,
            text(" { _ => "),
            armAnalyses[0]?.body.document ?? text(""),
            text(" }"),
          ])
        : concat([
            text("match "),
            valueAnalysis.document,
            text(" {"),
            indent(concat(contentDocuments.flatMap((document) => [hardLine, document]))),
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
