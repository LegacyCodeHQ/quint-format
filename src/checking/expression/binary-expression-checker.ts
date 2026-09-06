import type { BinaryOperator } from "@/core/analysis.js";
import type { FormatDiagnostic } from "@/core/diagnostics.js";
import { indentWidth } from "@/formatting/document.js";

export function checkBinaryExpressions(
  operators: BinaryOperator[],
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];

  for (const operator of operators) {
    let commentAnchor = operator.left;
    for (const comment of operator.inlineComments) {
      const commentGap = source.slice(commentAnchor.endIndex, comment.startIndex);
      if (commentGap !== " ") {
        const row = comment.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: comment.startPosition.column + 1,
          length: 2,
          rule: "format/comment-spacing",
          message: "expected one space before an inline comment",
          sourceLine: lines[row] ?? "",
        });
      }
      commentAnchor = comment;
    }

    const beforeOperator = source.slice(commentAnchor.endIndex, operator.node.startIndex);
    const afterOperator = source.slice(operator.node.endIndex, operator.right.startIndex);
    const hasOperatorComments =
      operator.inlineComments.length > 0 || operator.rightComments.length > 0;
    const preservesMultilinePairValue = operator.plan.pairValue;
    const preservesLeadingOperatorBreak = operator.plan.operatorBreak;
    const preservesRightOperandBreak = !hasOperatorComments && operator.plan.rightBreak;
    const hasCanonicalBeforeOperator = preservesLeadingOperatorBreak
      ? /^(?:\r\n|\r|\n)[\t ]*$/.test(beforeOperator)
      : beforeOperator === " ";
    const hasCanonicalAfterOperator = preservesRightOperandBreak
      ? /^(?:\r\n|\r|\n)[\t ]*$/.test(afterOperator)
      : afterOperator === " ";
    if (
      !hasCanonicalBeforeOperator ||
      (operator.rightComments.length === 0 && !hasCanonicalAfterOperator)
    ) {
      const row = operator.node.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: operator.node.startPosition.column + 1,
        length: operator.node.text.length,
        rule: "format/binary-operator-spacing",
        message: preservesLeadingOperatorBreak
          ? `expected a line break before '${operator.node.text}' and one space after it`
          : preservesRightOperandBreak
            ? `expected one space before '${operator.node.text}' and a line break after it`
            : `expected one space around '${operator.node.text}'`,
        sourceLine: lines[row] ?? "",
      });
    }
    if (preservesLeadingOperatorBreak) {
      const expressionLine = lines[operator.left.startPosition.row] ?? "";
      const isExpandedConditionalCondition = operator.plan.expandedCondition;
      const alignsMatchOperands = operator.plan.matchPeers;
      const expectedColumn =
        expressionLine.search(/\S|$/) + operator.plan.operatorIndent * indentWidth;
      if (operator.node.startPosition.column !== expectedColumn) {
        const row = operator.node.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, operator.node.startPosition.column),
          rule: "format/binary-operator-indentation",
          message: alignsMatchOperands
            ? "expected alignment with the match operands"
            : isExpandedConditionalCondition
              ? "expected alignment within the expanded conditional condition"
              : "expected a four-space continuation indent",
          sourceLine: lines[row] ?? "",
        });
      }
    }
    if (preservesRightOperandBreak) {
      const expressionLine = lines[operator.left.startPosition.row] ?? "";
      const alignsMatchOperands = operator.plan.matchPeers;
      const expectedColumn =
        expressionLine.search(/\S|$/) + operator.plan.rightIndent * indentWidth;
      if (operator.right.startPosition.column !== expectedColumn) {
        const row = operator.right.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, operator.right.startPosition.column),
          rule: "format/binary-operator-indentation",
          message: alignsMatchOperands
            ? "expected alignment with the left match operand"
            : preservesLeadingOperatorBreak
              ? "expected the right operand four spaces beyond the continued operator"
              : preservesMultilinePairValue
                ? "expected a two-space map value continuation"
                : "expected a four-space continuation indent",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }

  return diagnostics;
}
