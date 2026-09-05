import type Parser from "tree-sitter";
import { analyzeAccessExpression } from "./access-expression-analyzer.js";
import type { ExpressionAnalysis } from "./analysis.js";
import { commentDocument } from "./comments.js";
import { analyzeConditionalExpression } from "./conditional-expression-analyzer.js";
import { indentBy } from "./definition-body-formatter.js";
import { concat, type Doc, group, hardLine, indent, line, renderDoc, text } from "./document.js";
import { analyzeLambdaExpression } from "./lambda-expression-analyzer.js";
import { analyzeLiteralExpression } from "./literal-expression-analyzer.js";
import { analyzeLocalDefinition } from "./local-definition-analyzer.js";
import { analyzeMatchExpression } from "./match-expression-analyzer.js";
import { analyzeOperatorExpression } from "./operator-expression-analyzer.js";
import { formatPattern } from "./pattern-formatter.js";
import {
  compactNestedBlockExpression,
  isCompactNondetSequence,
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

  if (node.type === "assignment_expression") {
    const target = node.childForFieldName("target");
    const value = node.childForFieldName("value");
    const name = target?.childForFieldName("name");
    const equals = node.children.find((child) => child.type === "=");
    if (!target || !name || !value || !equals) {
      throw new Error("Unable to locate the assignment target or value");
    }
    const analysis = analyzeExpression(value);
    const preservesLineBreak = value.startPosition.row > equals.endPosition.row;
    return {
      document: preservesLineBreak
        ? concat([text(`${formatPattern(name)}' =`), indent(concat([hardLine, analysis.document]))])
        : concat([text(`${formatPattern(name)}' = `), analysis.document]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  if (node.type === "nested_definition_expression") {
    const definition = node.childForFieldName("definition");
    const body = node.childForFieldName("body");
    if (!definition || !body) {
      throw new Error("Unable to locate the nested definition or body");
    }
    const definitionAnalysis = analyzeLocalDefinition(definition, analyzeExpression);
    const bodyAnalysis = analyzeExpression(body);
    const compactBlockExpression = compactNestedBlockExpression(definition, body);
    const compactBlockAnalysis = compactBlockExpression
      ? analyzeExpression(compactBlockExpression)
      : null;
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= definition.endIndex &&
        child.endIndex <= body.startIndex,
    );
    const definitionValue =
      definition.childForFieldName("value") ?? definition.childForFieldName("body");
    const trailingDefinitionComments = comments.filter(
      (comment) => comment.startPosition.row === definitionValue?.endPosition.row,
    );
    const leadingBodyComments = comments.filter(
      (comment) => comment.startPosition.row !== definitionValue?.endPosition.row,
    );
    const semicolon = definition.children.find((child) => child.type === ";");
    let trailingCommentAnchor =
      semicolon?.endIndex ?? definitionValue?.endIndex ?? definition.endIndex;
    const definitionDocument = concat([
      definitionAnalysis.document,
      ...trailingDefinitionComments.flatMap((comment) => {
        const gap = node.text.slice(
          trailingCommentAnchor - node.startIndex,
          comment.startIndex - node.startIndex,
        );
        trailingCommentAnchor = comment.endIndex;
        return [text(gap), commentDocument(comment)];
      }),
    ]);
    const firstComment = leadingBodyComments[0];
    const preservesLeadingCommentGap = Boolean(
      firstComment &&
        definitionValue &&
        firstComment.startPosition.row > definitionValue.endPosition.row + 1,
    );
    const preservesBodyGap =
      leadingBodyComments.length === 0 &&
      definitionValue !== null &&
      body.startPosition.row > definitionValue.endPosition.row + 1;
    const preservesCompactNondetSequence = isCompactNondetSequence(definition, body);
    const analyses = [definitionAnalysis, bodyAnalysis];
    return {
      document: compactBlockAnalysis
        ? concat([definitionDocument, text(" { "), compactBlockAnalysis.document, text(" }")])
        : preservesCompactNondetSequence
          ? concat([definitionDocument, text(semicolon ? "; " : " "), bodyAnalysis.document])
          : concat([
              definitionDocument,
              hardLine,
              ...(preservesBodyGap || preservesLeadingCommentGap ? [hardLine] : []),
              ...leadingBodyComments.flatMap((comment) => [commentDocument(comment), hardLine]),
              bodyAnalysis.document,
            ]),
      binaryOperators: analyses.flatMap((analysis) => analysis.binaryOperators),
      unitLiterals: analyses.flatMap((analysis) => analysis.unitLiterals),
      sequenceLiterals: analyses.flatMap((analysis) => analysis.sequenceLiterals),
      recordLiterals: analyses.flatMap((analysis) => analysis.recordLiterals),
      callExpressions: analyses.flatMap((analysis) => analysis.callExpressions),
    };
  }

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
