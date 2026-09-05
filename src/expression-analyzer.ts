import type Parser from "tree-sitter";
import { analyzeAccessExpression } from "./access-expression-analyzer.js";
import type { ExpressionAnalysis } from "./analysis.js";
import { analyzeAssignmentExpression } from "./assignment-expression-analyzer.js";
import { analyzeBlockExpression } from "./block-expression-analyzer.js";
import { commentDocument } from "./comments.js";
import { analyzeConditionalExpression } from "./conditional-expression-analyzer.js";
import { indentBy } from "./definition-body-formatter.js";
import { concat, type Doc, hardLine, renderDoc, text } from "./document.js";
import { analyzeLambdaExpression } from "./lambda-expression-analyzer.js";
import { analyzeLiteralExpression } from "./literal-expression-analyzer.js";
import { analyzeMatchExpression } from "./match-expression-analyzer.js";
import { analyzeNestedDefinitionExpression } from "./nested-definition-expression-analyzer.js";
import { analyzeOperatorExpression } from "./operator-expression-analyzer.js";
import {
  isMultilineLambdaExpression,
  isMultilineParenthesizedPostfixReceiver,
  isMultilineUfcsContinuation,
  isNestedInVerticallyExpandedCall,
  ufcsContinuationIndentation,
} from "./syntax.js";

export function analyzeExpression(node: Parser.SyntaxNode): ExpressionAnalysis {
  return analyzeExpressionWithClosingComment(node);
}

function analyzeExpressionWithClosingComment(
  node: Parser.SyntaxNode,
  trailingClosingComment?: Parser.SyntaxNode,
): ExpressionAnalysis {
  const literalAnalysis = analyzeLiteralExpression(
    node,
    trailingClosingComment,
    analyzeExpression,
    analyzeExpressionWithClosingComment,
  );
  if (literalAnalysis) return literalAnalysis;

  const accessAnalysis = analyzeAccessExpression(node, analyzeExpression);
  if (accessAnalysis) return accessAnalysis;

  const operatorAnalysis = analyzeOperatorExpression(node, analyzeExpression);
  if (operatorAnalysis) return operatorAnalysis;

  const lambdaAnalysis = analyzeLambdaExpression(node, analyzeExpression);
  if (lambdaAnalysis) return lambdaAnalysis;

  const conditionalAnalysis = analyzeConditionalExpression(node, analyzeExpression);
  if (conditionalAnalysis) return conditionalAnalysis;

  const matchAnalysis = analyzeMatchExpression(node, analyzeExpression);
  if (matchAnalysis) return matchAnalysis;

  const assignmentAnalysis = analyzeAssignmentExpression(node, analyzeExpression);
  if (assignmentAnalysis) return assignmentAnalysis;

  const nestedDefinitionAnalysis = analyzeNestedDefinitionExpression(node, analyzeExpression);
  if (nestedDefinitionAnalysis) return nestedDefinitionAnalysis;

  const blockAnalysis = analyzeBlockExpression(node, analyzeExpression);
  if (blockAnalysis) return blockAnalysis;

  if (node.type === "call_expression") {
    const functionNode = node.childForFieldName("function");
    const arguments_ = node.childrenForFieldName("argument");
    if (!functionNode) throw new Error("Unable to locate the call target");
    const openParenthesis = node.children.find((child) => child.type === "(");
    const closeParenthesis = [...node.children].reverse().find((child) => child.type === ")");
    const functionAnalysis = analyzeExpression(functionNode);
    const analyses = arguments_.map(analyzeExpression);
    const allowsTrailingComma = functionNode.type !== "field_access_expression";
    const hasComments = node.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
    const multilineLambdaArgument =
      arguments_.length === 1 && isMultilineLambdaExpression(arguments_[0] as Parser.SyntaxNode);
    const multilineUfcsCall = isMultilineUfcsContinuation(functionNode);
    let multilineUfcsLambdaDocument: Doc | undefined;
    if (multilineLambdaArgument && multilineUfcsCall) {
      const object = functionNode.childForFieldName("object");
      const field = functionNode.childForFieldName("field");
      if (!object || !field) throw new Error("Unable to locate the UFCS call target");
      const objectAnalysis = analyzeExpression(object);
      multilineUfcsLambdaDocument = concat([
        objectAnalysis.document,
        indentBy(
          concat([
            hardLine,
            text(`.${field.text}(`),
            (analyses[0] as ExpressionAnalysis).document,
            hardLine,
            text(")"),
          ]),
          ufcsContinuationIndentation(),
        ),
      ]);
    }
    const multilineLambdaCallDocument =
      multilineUfcsLambdaDocument ??
      (multilineLambdaArgument
        ? concat([
            functionAnalysis.document,
            text("("),
            (analyses[0] as ExpressionAnalysis).document,
            ...(allowsTrailingComma ? [text(",")] : []),
            hardLine,
            text(")"),
          ])
        : undefined);
    const inlineCallDocument = concat([
      functionAnalysis.document,
      text("("),
      ...analyses.flatMap((analysis, index) => [
        ...(index === 0 ? [] : [text(", ")]),
        analysis.document,
      ]),
      text(")"),
    ]);
    const inlineCallLines = renderDoc(inlineCallDocument).split("\n");
    const hasMultilineArgumentDocument = inlineCallLines.length > 1;
    const hasInlineMultilineLambdaArgument = arguments_.some((argument, index) => {
      const previous = index === 0 ? openParenthesis : arguments_[index - 1];
      return (
        isMultilineLambdaExpression(argument) &&
        Boolean(previous && argument.startPosition.row === previous.endPosition.row)
      );
    });
    const exceedsLineWidth = inlineCallLines.some(
      (line, index) => line.length + (index === 0 ? node.startPosition.column : 0) > 120,
    );
    const firstSourceArgumentBreakIndex = arguments_.findIndex((argument, index) => {
      if (index === 0) return false;
      const previous = arguments_[index - 1];
      return Boolean(previous && argument.startPosition.row > previous.endPosition.row);
    });
    const hangingInlineArgumentCount =
      firstSourceArgumentBreakIndex < 0 ? arguments_.length : firstSourceArgumentBreakIndex;
    const hangingFirstLineDocument = concat([
      functionAnalysis.document,
      text("("),
      ...analyses
        .slice(0, hangingInlineArgumentCount)
        .flatMap((analysis, index) => [...(index === 0 ? [] : [text(", ")]), analysis.document]),
    ]);
    const hangingFirstLineExceedsWidth = renderDoc(hangingFirstLineDocument)
      .split("\n")
      .some((line) => line.length + node.startPosition.column > 120);
    const hasSourceArgumentBreak = arguments_.some((argument, index) => {
      const previous = index === 0 ? openParenthesis : arguments_[index - 1];
      return previous && argument.startPosition.row > previous.endPosition.row;
    });
    const hasSourceClosingBreak = Boolean(
      closeParenthesis &&
        arguments_.at(-1) &&
        closeParenthesis.startPosition.row >
          (arguments_.at(-1) as Parser.SyntaxNode).endPosition.row,
    );
    const hangingGroupedCall = Boolean(
      arguments_.length >= 2 &&
        openParenthesis &&
        arguments_[0]?.startPosition.row === openParenthesis.endPosition.row &&
        hasSourceArgumentBreak &&
        !hasSourceClosingBreak &&
        !hangingFirstLineExceedsWidth,
    );
    const partiallyExpandedCallWithClosingBreak = Boolean(
      arguments_.length >= 2 &&
        openParenthesis &&
        arguments_[0]?.startPosition.row === openParenthesis.endPosition.row &&
        hasSourceArgumentBreak &&
        hasSourceClosingBreak &&
        !hangingFirstLineExceedsWidth,
    );
    const multilineLocalDefinitionArgument =
      arguments_.length === 1 &&
      arguments_[0]?.type === "nested_definition_expression" &&
      hasSourceArgumentBreak &&
      hasSourceClosingBreak;
    const inlineMultilineLambdaCall =
      arguments_.length > 1 &&
      isMultilineLambdaExpression(arguments_.at(-1) as Parser.SyntaxNode) &&
      hasInlineMultilineLambdaArgument &&
      !hasSourceArgumentBreak &&
      hasSourceClosingBreak &&
      !exceedsLineWidth;
    const hangingMultilineLambdaCall =
      arguments_.length > 1 &&
      isMultilineLambdaExpression(arguments_.at(-1) as Parser.SyntaxNode) &&
      Boolean(
        arguments_.at(-2) &&
          (arguments_.at(-1) as Parser.SyntaxNode).startPosition.row >
            (arguments_.at(-2) as Parser.SyntaxNode).endPosition.row,
      ) &&
      arguments_.slice(0, -1).every((argument, index) => {
        const previous = index === 0 ? openParenthesis : arguments_[index - 1];
        return Boolean(previous && argument.startPosition.row === previous.endPosition.row);
      }) &&
      hasSourceClosingBreak;
    const isFullyExpandedCall =
      arguments_.length >= 2 &&
      hasSourceClosingBreak &&
      arguments_.every((argument, index) => {
        const previous = index === 0 ? openParenthesis : arguments_[index - 1];
        return Boolean(previous && argument.startPosition.row > previous.endPosition.row);
      });
    const sourceMultilineCall =
      arguments_.length > 0 &&
      (exceedsLineWidth ||
        (hasMultilineArgumentDocument && !hasInlineMultilineLambdaArgument) ||
        isFullyExpandedCall ||
        (hasSourceArgumentBreak && hasSourceClosingBreak) ||
        isNestedInVerticallyExpandedCall(node)) &&
      (hasSourceArgumentBreak || hasSourceClosingBreak);
    const sourceArgumentDocuments = analyses.flatMap((analysis, index) => {
      const argument = arguments_[index] as Parser.SyntaxNode;
      const previous = index === 0 ? openParenthesis : arguments_[index - 1];
      const startsOnNewLine = Boolean(
        previous && argument.startPosition.row > previous.endPosition.row,
      );
      return [
        ...(index > 0 ? [text(",")] : []),
        ...(index > 0 && startsOnNewLine ? [hardLine] : index > 0 ? [text(" ")] : []),
        analysis.document,
      ];
    });
    const contentDocuments = hasComments
      ? node.namedChildren.flatMap((child) => {
          if (child.id === functionNode.id) return [];
          if (child.type === "comment" || child.type === "documentation_comment") {
            return [commentDocument(child)];
          }
          const argumentIndex = arguments_.findIndex((argument) => argument.id === child.id);
          const analysis = analyses[argumentIndex];
          if (!analysis) {
            throw new Error("Formatting this commented call content is not implemented yet");
          }
          return [
            concat([
              analysis.document,
              ...(argumentIndex < arguments_.length - 1 || allowsTrailingComma ? [text(",")] : []),
            ]),
          ];
        })
      : [];
    return {
      document: hasComments
        ? concat([
            functionAnalysis.document,
            text("("),
            indentBy(concat(contentDocuments.flatMap((document) => [hardLine, document])), 2),
            hardLine,
            text(")"),
          ])
        : multilineLambdaCallDocument
          ? multilineLambdaCallDocument
          : hangingMultilineLambdaCall
            ? concat([
                functionAnalysis.document,
                text("("),
                ...analyses
                  .slice(0, -1)
                  .flatMap((analysis, index) => [
                    ...(index === 0 ? [] : [text(", ")]),
                    analysis.document,
                  ]),
                text(","),
                indentBy(
                  concat([
                    hardLine,
                    (analyses.at(-1) as ExpressionAnalysis).document,
                    ...(allowsTrailingComma ? [text(",")] : []),
                  ]),
                  multilineUfcsCall ? ufcsContinuationIndentation() + 1 : 1,
                ),
                hardLine,
                indentBy(text(")"), multilineUfcsCall ? ufcsContinuationIndentation() : 0),
              ])
            : inlineMultilineLambdaCall
              ? concat([
                  functionAnalysis.document,
                  text("("),
                  ...analyses.flatMap((analysis, index) => [
                    ...(index === 0 ? [] : [text(", ")]),
                    analysis.document,
                  ]),
                  ...(allowsTrailingComma ? [text(",")] : []),
                  hardLine,
                  text(")"),
                ])
              : multilineLocalDefinitionArgument
                ? concat([
                    functionAnalysis.document,
                    text("("),
                    indentBy(
                      concat([hardLine, (analyses[0] as ExpressionAnalysis).document]),
                      multilineUfcsCall ? ufcsContinuationIndentation() + 1 : 1,
                    ),
                    ...(allowsTrailingComma ? [text(",")] : []),
                    hardLine,
                    indentBy(text(")"), multilineUfcsCall ? ufcsContinuationIndentation() : 0),
                  ])
                : partiallyExpandedCallWithClosingBreak
                  ? concat([
                      functionAnalysis.document,
                      text("("),
                      indentBy(
                        concat(sourceArgumentDocuments),
                        multilineUfcsCall ? ufcsContinuationIndentation() + 2 : 2,
                      ),
                      ...(allowsTrailingComma ? [text(",")] : []),
                      hardLine,
                      indentBy(text(")"), multilineUfcsCall ? ufcsContinuationIndentation() : 0),
                    ])
                  : hangingGroupedCall
                    ? concat([
                        functionAnalysis.document,
                        text("("),
                        indentBy(
                          concat(sourceArgumentDocuments),
                          multilineUfcsCall ? ufcsContinuationIndentation() + 2 : 2,
                        ),
                        text(")"),
                      ])
                    : multilineUfcsCall
                      ? concat([
                          functionAnalysis.document,
                          indentBy(
                            concat([
                              text("("),
                              ...analyses.flatMap((analysis, index) => [
                                ...(index === 0 ? [] : [text(", ")]),
                                analysis.document,
                              ]),
                              text(")"),
                            ]),
                            ufcsContinuationIndentation(),
                          ),
                        ])
                      : sourceMultilineCall
                        ? concat([
                            functionAnalysis.document,
                            text("("),
                            indentBy(
                              concat([
                                hardLine,
                                ...sourceArgumentDocuments,
                                ...(allowsTrailingComma ? [text(",")] : []),
                              ]),
                              2,
                            ),
                            hardLine,
                            text(")"),
                          ])
                        : inlineCallDocument,
      binaryOperators: [
        ...functionAnalysis.binaryOperators,
        ...analyses.flatMap((analysis) => analysis.binaryOperators),
      ],
      unitLiterals: [
        ...functionAnalysis.unitLiterals,
        ...analyses.flatMap((analysis) => analysis.unitLiterals),
      ],
      sequenceLiterals: [
        ...functionAnalysis.sequenceLiterals,
        ...analyses.flatMap((analysis) => analysis.sequenceLiterals),
      ],
      recordLiterals: [
        ...functionAnalysis.recordLiterals,
        ...analyses.flatMap((analysis) => analysis.recordLiterals),
      ],
      callExpressions: [
        node,
        ...functionAnalysis.callExpressions,
        ...analyses.flatMap((analysis) => analysis.callExpressions),
      ],
    };
  }

  if (node.type === "parenthesized_expression") {
    const expression = node.childForFieldName("expression");
    if (!expression) {
      throw new Error("Unable to locate the parenthesized expression field");
    }

    const analysis = analyzeExpression(expression);
    const isBlockBodiedLambda =
      expression.type === "lambda_expression" &&
      expression.childForFieldName("body")?.type === "block_expression";
    const isBlockCombinator = [
      "all_expression",
      "any_expression",
      "and_block_expression",
      "or_block_expression",
    ].includes(expression.type);
    const isExplicitlyExpanded =
      node.startPosition.row < expression.startPosition.row ||
      expression.endPosition.row < node.endPosition.row;
    return {
      document:
        isMultilineParenthesizedPostfixReceiver(node) && !isBlockBodiedLambda && !isBlockCombinator
          ? concat([text("("), analysis.document, hardLine, text(")")])
          : isExplicitlyExpanded
            ? concat([
                text("("),
                indentBy(concat([hardLine, analysis.document]), 2),
                hardLine,
                text(")"),
              ])
            : concat([text("("), analysis.document, text(")")]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  throw new Error("Formatting this expression syntax is not implemented yet");
}
