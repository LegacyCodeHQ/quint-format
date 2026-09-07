import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { commentDocument } from "@/formatting/comments.js";
import { indentBy } from "@/formatting/definition-body-formatter.js";
import { concat, type Doc, hardLine, renderDoc, text } from "@/formatting/document.js";
import { preservedContinuationPrefix } from "@/formatting/source-spacing.js";
import {
  callExpressionTarget,
  callTrailingCommentAlignment,
  hasAttachedMultilineLambdaCallClose,
  hasMultilineLambdaBody,
  isCallExpression,
  isMultilineLambdaExpression,
  isMultilineParenthesizedPostfixReceiver,
  isMultilineUfcsContinuation,
  isNestedInVerticallyExpandedCall,
  ufcsContinuationIndentation,
} from "@/parsing/syntax.js";

export function analyzeCallExpression(
  node: Parser.SyntaxNode,
  analyzeExpression: (node: Parser.SyntaxNode) => ExpressionAnalysis,
): ExpressionAnalysis | undefined {
  if (isCallExpression(node)) {
    const target = callExpressionTarget(node);
    const arguments_ = node.childrenForFieldName("argument");
    if (!target) throw new Error("Unable to locate the call target");
    const { functionNode } = target;
    const receiver = target.kind === "ufcs" ? target.receiver : undefined;
    const method = target.kind === "ufcs" ? target.method : undefined;
    const dot = target.kind === "ufcs" ? target.dot : undefined;
    const openParenthesis = node.children.find((child) => child.type === "(");
    const closeParenthesis = [...node.children].reverse().find((child) => child.type === ")");
    const lastArgument = arguments_.at(-1);
    const trailingComma = node.children.find(
      (child) =>
        child.type === "," && Boolean(lastArgument && child.startIndex >= lastArgument.endIndex),
    );
    const trailingCommaDocuments = trailingComma ? [text(",")] : [];
    const preservesAttachedMultilineLambdaCallClose =
      !trailingComma && hasAttachedMultilineLambdaCallClose(node);
    const receiverAnalysis = receiver ? analyzeExpression(receiver) : undefined;
    const targetComments =
      receiver && method
        ? node.namedChildren.filter(
            (child) =>
              (child.type === "comment" || child.type === "documentation_comment") &&
              child.startIndex >= receiver.endIndex &&
              child.endIndex <= method.startIndex,
          )
        : [];
    const targetContinuationPrefix =
      receiver && dot ? preservedContinuationPrefix(receiver, targetComments, dot) : [];
    const functionAnalysis =
      receiver && receiverAnalysis && method && dot
        ? {
            ...receiverAnalysis,
            document:
              targetComments.length === 0
                ? isMultilineUfcsContinuation(node) &&
                  !isMultilineParenthesizedPostfixReceiver(receiver)
                  ? concat([
                      receiverAnalysis.document,
                      indentBy(
                        concat([...targetContinuationPrefix, text(`.${method.text}`)]),
                        ufcsContinuationIndentation(),
                      ),
                    ])
                  : concat([receiverAnalysis.document, text(`.${method.text}`)])
                : concat([
                    receiverAnalysis.document,
                    indentBy(
                      concat([...targetContinuationPrefix, text(`.${method.text}`)]),
                      ufcsContinuationIndentation(),
                    ),
                  ]),
          }
        : analyzeExpression(functionNode);
    const analyses = arguments_.map(analyzeExpression);
    const callContentChildren = node.namedChildren.filter(
      (child) =>
        openParenthesis &&
        closeParenthesis &&
        child.startIndex >= openParenthesis.endIndex &&
        child.endIndex <= closeParenthesis.startIndex,
    );
    const hasComments = callContentChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
    const trailingCommentAlignment = callTrailingCommentAlignment(node);
    const multilineLambdaArgument =
      arguments_.length === 1 && isMultilineLambdaExpression(arguments_[0] as Parser.SyntaxNode);
    const multilineUfcsCall = target.kind === "ufcs" && isMultilineUfcsContinuation(node);
    let multilineUfcsLambdaDocument: Doc | undefined;
    if (multilineLambdaArgument && multilineUfcsCall) {
      if (!receiver || !method) throw new Error("Unable to locate the UFCS call target");
      const objectAnalysis = receiverAnalysis ?? analyzeExpression(receiver);
      multilineUfcsLambdaDocument = concat([
        objectAnalysis.document,
        indentBy(
          concat([
            ...targetContinuationPrefix,
            text(`.${method.text}(`),
            (analyses[0] as ExpressionAnalysis).document,
            ...trailingCommaDocuments,
            ...(preservesAttachedMultilineLambdaCallClose ? [] : [hardLine]),
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
            ...trailingCommaDocuments,
            ...(preservesAttachedMultilineLambdaCallClose ? [] : [hardLine]),
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
      ...trailingCommaDocuments,
      text(")"),
    ]);
    const inlineCallLines = renderDoc(inlineCallDocument).split("\n");
    const hasMultilineArgumentDocument = inlineCallLines.length > 1;
    const inlineCallFirstLineExceedsWidth =
      (inlineCallLines[0]?.length ?? 0) + node.startPosition.column > 120;
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
    const hasFullyExpandedArguments =
      arguments_.length >= 2 &&
      arguments_.every((argument, index) => {
        const previous = index === 0 ? openParenthesis : arguments_[index - 1];
        return Boolean(previous && argument.startPosition.row > previous.endPosition.row);
      });
    const hangingGroupedCall = Boolean(
      arguments_.length >= 2 &&
        openParenthesis &&
        arguments_[0]?.startPosition.row === openParenthesis.endPosition.row &&
        hasSourceArgumentBreak &&
        !hasSourceClosingBreak &&
        !hangingFirstLineExceedsWidth,
    );
    const leadingExpandedCallWithAttachedClose =
      hasFullyExpandedArguments && !hasSourceClosingBreak;
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
      (hasSourceClosingBreak || hasMultilineLambdaBody(arguments_.at(-1) as Parser.SyntaxNode)) &&
      !inlineCallFirstLineExceedsWidth;
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
    const isFullyExpandedCall = hasFullyExpandedArguments && hasSourceClosingBreak;
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
    const contentDocuments: Doc[] = [];
    const contentAnchors: Parser.SyntaxNode[] = [];
    if (hasComments) {
      const argumentDocumentIndexes = new Map<number, number>();
      for (const child of callContentChildren) {
        if (child.type === "comment" || child.type === "documentation_comment") {
          const trailingArgument = [...arguments_]
            .reverse()
            .find(
              (argument) =>
                argument.endIndex <= child.startIndex &&
                argument.endPosition.row === child.startPosition.row,
            );
          const documentIndex = trailingArgument
            ? argumentDocumentIndexes.get(trailingArgument.id)
            : undefined;
          if (documentIndex !== undefined) {
            contentDocuments[documentIndex] = concat([
              contentDocuments[documentIndex] as Doc,
              text(" ".repeat(trailingCommentAlignment.get(child.id) ?? 1)),
              commentDocument(child),
            ]);
            contentAnchors[documentIndex] = child;
          } else {
            contentDocuments.push(commentDocument(child));
            contentAnchors.push(child);
          }
          continue;
        }
        const argumentIndex = arguments_.findIndex((argument) => argument.id === child.id);
        const analysis = analyses[argumentIndex];
        if (!analysis) {
          throw new Error("Formatting this commented call content is not implemented yet");
        }
        argumentDocumentIndexes.set(child.id, contentDocuments.length);
        contentDocuments.push(
          concat([
            analysis.document,
            ...(argumentIndex < arguments_.length - 1 || trailingComma ? [text(",")] : []),
          ]),
        );
        contentAnchors.push(child);
      }
    }
    const spacedContentDocuments = contentDocuments.flatMap((document, index) => {
      const current = contentAnchors[index] as Parser.SyntaxNode;
      const previous = index > 0 ? contentAnchors[index - 1] : undefined;
      const lineBreaks =
        previous && current.startPosition.row > previous.endPosition.row + 1 ? 2 : 1;
      return [...Array.from({ length: lineBreaks }, () => hardLine), document];
    });
    return {
      document: hasComments
        ? concat([
            functionAnalysis.document,
            text("("),
            indentBy(concat(spacedContentDocuments), 2),
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
                  concat([hardLine, (analyses.at(-1) as ExpressionAnalysis).document]),
                  multilineUfcsCall ? ufcsContinuationIndentation() + 1 : 1,
                ),
                ...trailingCommaDocuments,
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
                  ...trailingCommaDocuments,
                  ...(preservesAttachedMultilineLambdaCallClose ? [] : [hardLine]),
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
                    ...trailingCommaDocuments,
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
                      ...trailingCommaDocuments,
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
                        ...trailingCommaDocuments,
                        text(")"),
                      ])
                    : leadingExpandedCallWithAttachedClose
                      ? concat([
                          functionAnalysis.document,
                          text("("),
                          indentBy(
                            concat([hardLine, ...sourceArgumentDocuments]),
                            multilineUfcsCall ? ufcsContinuationIndentation() + 2 : 2,
                          ),
                          ...trailingCommaDocuments,
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
                                ...trailingCommaDocuments,
                                ...(hasSourceClosingBreak ? [hardLine] : []),
                                text(")"),
                              ]),
                              ufcsContinuationIndentation(),
                            ),
                          ])
                        : sourceMultilineCall
                          ? concat([
                              functionAnalysis.document,
                              text("("),
                              indentBy(concat([hardLine, ...sourceArgumentDocuments]), 2),
                              ...trailingCommaDocuments,
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

  return undefined;
}
