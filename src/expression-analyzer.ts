import type Parser from "tree-sitter";
import type { ExpressionAnalysis } from "./analysis.js";
import { commentDocument } from "./comments.js";
import { definitionBodyDocument, indentBy } from "./definition-body-formatter.js";
import { concat, type Doc, group, hardLine, indent, line, renderDoc, text } from "./document.js";
import { formatCommentedTuplePattern, formatPattern } from "./pattern-formatter.js";
import {
  compactLambdaBlockExpression,
  compactNestedBlockExpression,
  isAlignedLocalTrailingComment,
  isBlockCombinatorEntry,
  isCompactDefaultMatch,
  isCompactNondetSequence,
  isElseIfBranch,
  isIndentedExpressionBody,
  isMultilineLambdaExpression,
  isMultilineParenthesizedPostfixReceiver,
  isMultilineUfcsContinuation,
  isNestedDefinitionBody,
  isNestedInVerticallyExpandedCall,
  isOrdinaryBlockResult,
  isWithinConditionalCondition,
  ufcsContinuationIndentation,
} from "./syntax.js";
import { formatType } from "./type-formatter.js";

function localTrailingCommentDocuments(
  definition: Parser.SyntaxNode,
  value: Parser.SyntaxNode,
  comments: Parser.SyntaxNode[],
): Doc[] {
  return comments.flatMap((comment) => {
    const gap = isAlignedLocalTrailingComment(definition, comment)
      ? definition.text.slice(
          value.endIndex - definition.startIndex,
          comment.startIndex - definition.startIndex,
        )
      : " ";
    return [text(gap), commentDocument(comment)];
  });
}

function analyzeLocalDefinition(node: Parser.SyntaxNode): ExpressionAnalysis {
  if (node.type === "value_definition") {
    const qualifier = node.childForFieldName("qualifier");
    const name = node.childForFieldName("name");
    const typeNode = node.childForFieldName("type");
    const value = node.childForFieldName("value");
    if (!name || (qualifier && qualifier.type !== "pure")) {
      throw new Error("Unable to locate the local value definition");
    }
    const valueAnalysis = value ? analyzeExpression(value) : undefined;
    const trailingComments = value
      ? node.namedChildren.filter(
          (child) =>
            (child.type === "comment" || child.type === "documentation_comment") &&
            child.startIndex >= value.endIndex,
        )
      : [];
    return {
      document: concat([
        value && valueAnalysis
          ? definitionBodyDocument(
              `${qualifier ? "pure " : ""}val ${formatPattern(name)}${typeNode ? `: ${formatType(typeNode)}` : ""} =`,
              node,
              value,
              valueAnalysis.document,
            )
          : text(
              `${qualifier ? "pure " : ""}val ${formatPattern(name)}${typeNode ? `: ${formatType(typeNode)}` : ""}`,
            ),
        ...(value ? localTrailingCommentDocuments(node, value, trailingComments) : []),
      ]),
      binaryOperators: valueAnalysis?.binaryOperators ?? [],
      unitLiterals: valueAnalysis?.unitLiterals ?? [],
      sequenceLiterals: valueAnalysis?.sequenceLiterals ?? [],
      recordLiterals: valueAnalysis?.recordLiterals ?? [],
      callExpressions: valueAnalysis?.callExpressions ?? [],
    };
  }

  if (node.type === "operator_definition") {
    const qualifier = node.childForFieldName("qualifier");
    const defKeyword = node.children.find((child) => child.type === "def");
    const name = node.childForFieldName("name");
    const parameters = node.childrenForFieldName("parameter");
    const returnType = node.childForFieldName("return_type");
    const body = node.childForFieldName("body");
    if (!name || (!defKeyword && !qualifier)) {
      throw new Error("Unable to locate the local operator definition");
    }
    const bodyAnalysis = body ? analyzeExpression(body) : undefined;
    const trailingComments = body
      ? node.namedChildren.filter(
          (child) =>
            (child.type === "comment" || child.type === "documentation_comment") &&
            child.startIndex >= body.endIndex,
        )
      : [];
    const head = defKeyword ? `${qualifier ? `${qualifier.text} ` : ""}def` : qualifier?.text;
    const parameterList =
      parameters.length > 0
        ? `(${parameters
            .map((parameter) => {
              const parameterName = parameter.childForFieldName("name");
              const parameterType = parameter.childForFieldName("type");
              if (!parameterName) throw new Error("Unable to locate a local operator parameter");
              return `${formatPattern(parameterName)}${parameterType ? `: ${formatType(parameterType)}` : ""}`;
            })
            .join(", ")})`
        : "";
    return {
      document: concat([
        body && bodyAnalysis
          ? definitionBodyDocument(
              `${head} ${name.text}${parameterList}${returnType ? `: ${formatType(returnType)}` : ""} =`,
              node,
              body,
              bodyAnalysis.document,
            )
          : text(
              `${head} ${name.text}${parameterList}${returnType ? `: ${formatType(returnType)}` : ""}`,
            ),
        ...(body ? localTrailingCommentDocuments(node, body, trailingComments) : []),
      ]),
      binaryOperators: bodyAnalysis?.binaryOperators ?? [],
      unitLiterals: bodyAnalysis?.unitLiterals ?? [],
      sequenceLiterals: bodyAnalysis?.sequenceLiterals ?? [],
      recordLiterals: bodyAnalysis?.recordLiterals ?? [],
      callExpressions: bodyAnalysis?.callExpressions ?? [],
    };
  }

  throw new Error("Formatting this local definition syntax is not implemented yet");
}

export function analyzeExpression(node: Parser.SyntaxNode): ExpressionAnalysis {
  return analyzeExpressionWithClosingComment(node);
}

function analyzeExpressionWithClosingComment(
  node: Parser.SyntaxNode,
  trailingClosingComment?: Parser.SyntaxNode,
): ExpressionAnalysis {
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
            text(node.type === "list_literal" && elements.length > 0 ? "[ " : openDelimiter),
            ...analyses.flatMap((analysis, index) => [
              ...(index === 0 ? [] : [text(", ")]),
              analysis.document,
            ]),
            text(node.type === "list_literal" && elements.length > 0 ? " ]" : closeDelimiter),
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
          const attachesClosingComment =
            !isComment &&
            Boolean(trailingClosingComment) &&
            !entries.slice(index + 1).some((candidate) => candidate.analysis);
          lineDocuments.push(
            isComment
              ? entry.document
              : concat([
                  entry.document,
                  text(","),
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

  if (node.type === "field_access_expression") {
    const object = node.childForFieldName("object");
    const field = node.childForFieldName("field");
    const dot = node.children.find((child) => child.type === ".");
    if (!object || !field || !dot) {
      throw new Error("Unable to locate the field access operands");
    }
    const analysis = analyzeExpression(object);
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= object.endIndex &&
        child.endIndex <= field.startIndex,
    );
    const isMultilineContinuation =
      isMultilineUfcsContinuation(node) && !isMultilineParenthesizedPostfixReceiver(object);
    return {
      document:
        comments.length === 0
          ? isMultilineContinuation
            ? concat([
                analysis.document,
                indentBy(concat([hardLine, text(`.${field.text}`)]), ufcsContinuationIndentation()),
              ])
            : concat([analysis.document, text(`.${field.text}`)])
          : concat([
              analysis.document,
              indentBy(
                concat([
                  ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  text(`.${field.text}`),
                ]),
                ufcsContinuationIndentation(),
              ),
            ]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  if (node.type === "namespace_access_expression") {
    const namespace = node.childForFieldName("namespace");
    const members = node.childrenForFieldName("member");
    if (!namespace || members.length === 0) {
      throw new Error("Unable to locate the namespace access members");
    }
    return {
      document: text([namespace.text, ...members.map((member) => member.text)].join("::")),
      binaryOperators: [],
      unitLiterals: [],
      sequenceLiterals: [],
      recordLiterals: [],
      callExpressions: [],
    };
  }

  if (node.type === "index_expression") {
    const collection = node.childForFieldName("collection");
    const index = node.childForFieldName("index");
    if (!collection || !index) {
      throw new Error("Unable to locate the index expression operands");
    }
    const collectionAnalysis = analyzeExpression(collection);
    const indexAnalysis = analyzeExpression(index);
    return {
      document: concat([collectionAnalysis.document, text("["), indexAnalysis.document, text("]")]),
      binaryOperators: [...collectionAnalysis.binaryOperators, ...indexAnalysis.binaryOperators],
      unitLiterals: [...collectionAnalysis.unitLiterals, ...indexAnalysis.unitLiterals],
      sequenceLiterals: [...collectionAnalysis.sequenceLiterals, ...indexAnalysis.sequenceLiterals],
      recordLiterals: [...collectionAnalysis.recordLiterals, ...indexAnalysis.recordLiterals],
      callExpressions: [...collectionAnalysis.callExpressions, ...indexAnalysis.callExpressions],
    };
  }

  if (node.type === "unary_expression") {
    const operator = node.childForFieldName("operator");
    const operand = node.childForFieldName("operand");
    if (!operator || !operand) {
      throw new Error("Unable to locate the unary expression operands");
    }
    const analysis = analyzeExpression(operand);
    return {
      document: concat([text(operator.text), analysis.document]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  if (node.type === "lambda_expression") {
    const parameters = node.childrenForFieldName("parameter");
    const body = node.childForFieldName("body");
    const openParen = node.children.find((child) => child.type === "(");
    const arrow = node.children.find((child) => child.type === "=>");
    if (parameters.length === 0 || !body || !arrow) {
      throw new Error("Unable to locate the lambda parameters or body");
    }
    const parameterDocument = openParen
      ? concat([
          text("("),
          ...parameters.flatMap((parameter, index) => [
            ...(index === 0 ? [] : [text(", ")]),
            parameter.type === "tuple_pattern" &&
            parameter.namedChildren.some(
              (child) => child.type === "comment" || child.type === "documentation_comment",
            )
              ? formatCommentedTuplePattern(parameter)
              : text(formatPattern(parameter)),
          ]),
          text(")"),
        ])
      : text(formatPattern(parameters[0] as Parser.SyntaxNode));
    const compactBlockExpression = compactLambdaBlockExpression(node, body);
    const analysis = analyzeExpression(compactBlockExpression ?? body);
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.endIndex <= body.startIndex,
    );
    const isMultilineBody = isMultilineLambdaExpression(node);
    let continuationAnchor = node;
    let ancestor = node.parent;
    while (ancestor) {
      if (
        ancestor.startPosition.row === node.startPosition.row &&
        ancestor.startPosition.column < continuationAnchor.startPosition.column &&
        ancestor.type !== "module_definition" &&
        ancestor.type !== "source_file"
      ) {
        continuationAnchor = ancestor;
      }
      ancestor = ancestor.parent;
    }
    const continuationIndentation =
      body.startPosition.row > arrow.endPosition.row &&
      body.startPosition.column - continuationAnchor.startPosition.column >= 4
        ? 2
        : 1;
    return {
      document: compactBlockExpression
        ? concat([parameterDocument, text(" => { "), analysis.document, text(" }")])
        : comments.length === 0
          ? isMultilineBody
            ? concat([
                parameterDocument,
                text(" =>"),
                indentBy(concat([hardLine, analysis.document]), continuationIndentation),
              ])
            : concat([parameterDocument, text(" => "), analysis.document])
          : concat([
              parameterDocument,
              text(" =>"),
              indent(
                concat([
                  ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  analysis.document,
                ]),
              ),
            ]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
      sequenceLiterals: analysis.sequenceLiterals,
      recordLiterals: analysis.recordLiterals,
      callExpressions: analysis.callExpressions,
    };
  }

  if (node.type === "if_expression") {
    const condition = node.childForFieldName("condition");
    const consequence = node.childForFieldName("consequence");
    const alternative = node.childForFieldName("alternative");
    const closeParen = node.children.find((child) => child.type === ")");
    const elseKeyword = node.children.find((child) => child.type === "else");
    if (!condition || !consequence || !alternative || !closeParen || !elseKeyword) {
      throw new Error("Unable to locate the conditional branches");
    }
    const analyses = [condition, consequence, alternative].map(analyzeExpression);
    const [conditionAnalysis, consequenceAnalysis, alternativeAnalysis] = analyses;
    if (!conditionAnalysis || !consequenceAnalysis || !alternativeAnalysis) {
      throw new Error("Unable to analyze the conditional branches");
    }
    const consequenceComments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= condition.endIndex &&
        child.endIndex <= consequence.startIndex,
    );
    const alternativeComments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= consequence.endIndex &&
        child.endIndex <= alternative.startIndex,
    );
    const trailingConsequenceComments = alternativeComments.filter(
      (comment) => comment.startPosition.row === consequence.endPosition.row,
    );
    const leadingAlternativeComments = alternativeComments.filter(
      (comment) => !trailingConsequenceComments.some((trailing) => trailing.id === comment.id),
    );
    const inlineElseComment =
      leadingAlternativeComments.length === 1 &&
      leadingAlternativeComments[0]?.startPosition.row === elseKeyword.endPosition.row
        ? leadingAlternativeComments[0]
        : undefined;
    let consequenceCommentAnchor = consequence;
    const trailingConsequenceDocuments = trailingConsequenceComments.flatMap((comment) => {
      const gap = node.text.slice(
        consequenceCommentAnchor.endIndex - node.startIndex,
        comment.startIndex - node.startIndex,
      );
      consequenceCommentAnchor = comment;
      return [text(gap), commentDocument(comment)];
    });
    const consequenceDocument = concat([
      consequenceAnalysis.document,
      ...trailingConsequenceDocuments,
    ]);
    const expandsSourceMultilineCondition = condition.startPosition.row < condition.endPosition.row;
    const expandsConditionalChain = alternative.type === "if_expression";
    const formatsConditionalChain = expandsConditionalChain || isElseIfBranch(node);
    const hasSourceElseBreak = elseKeyword.startPosition.row > consequence.endPosition.row;
    const separatesCommentedElse = leadingAlternativeComments.length > 0;
    const preservesConsequenceLineBreak =
      consequence.type !== "block_expression" &&
      consequenceComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        hasSourceElseBreak ||
        leadingAlternativeComments.length > 0 ||
        consequence.startPosition.row > closeParen.endPosition.row);
    const preservesElseLineBreak =
      consequence.type !== "block_expression" &&
      leadingAlternativeComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        elseKeyword.startPosition.row > consequence.endPosition.row);
    const preservesAlternativeLineBreak =
      alternative.type !== "block_expression" &&
      alternative.type !== "if_expression" &&
      leadingAlternativeComments.length === 0 &&
      (formatsConditionalChain ||
        expandsSourceMultilineCondition ||
        hasSourceElseBreak ||
        alternative.startPosition.row > elseKeyword.endPosition.row);
    return {
      document: concat([
        text("if ("),
        conditionAnalysis.document,
        ...(consequenceComments.length === 0
          ? preservesConsequenceLineBreak
            ? [text(")"), indent(concat([hardLine, consequenceDocument]))]
            : [text(") "), consequenceDocument]
          : [
              text(")"),
              indent(
                concat([
                  ...consequenceComments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  consequenceDocument,
                ]),
              ),
            ]),
        ...(inlineElseComment
          ? [
              hardLine,
              text("else"),
              text(
                node.text.slice(
                  elseKeyword.endIndex - node.startIndex,
                  inlineElseComment.startIndex - node.startIndex,
                ),
              ),
              commentDocument(inlineElseComment),
              indent(concat([hardLine, alternativeAnalysis.document])),
            ]
          : leadingAlternativeComments.length === 0
            ? [
                ...(preservesElseLineBreak ? [hardLine, text("else")] : [text(" else")]),
                ...(preservesAlternativeLineBreak
                  ? [indent(concat([hardLine, alternativeAnalysis.document]))]
                  : [text(" "), alternativeAnalysis.document]),
              ]
            : [
                ...(separatesCommentedElse ? [hardLine, text("else")] : [text(" else")]),
                indent(
                  concat([
                    ...leadingAlternativeComments.flatMap((comment) => [
                      hardLine,
                      commentDocument(comment),
                    ]),
                    hardLine,
                    alternativeAnalysis.document,
                  ]),
                ),
              ]),
      ]),
      binaryOperators: analyses.flatMap((analysis) => analysis.binaryOperators),
      unitLiterals: analyses.flatMap((analysis) => analysis.unitLiterals),
      sequenceLiterals: analyses.flatMap((analysis) => analysis.sequenceLiterals),
      recordLiterals: analyses.flatMap((analysis) => analysis.recordLiterals),
      callExpressions: analyses.flatMap((analysis) => analysis.callExpressions),
    };
  }

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
    const definitionAnalysis = analyzeLocalDefinition(definition);
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

  if (node.type === "binary_expression") {
    const left = node.childForFieldName("left");
    const right = node.childForFieldName("right");
    const operator = node.childForFieldName("operator");
    if (!left || !right || !operator) {
      throw new Error("Formatting this binary expression syntax is not implemented yet");
    }

    const inlineComments = node.children.filter(
      (child) =>
        child.type === "comment" &&
        child.startIndex >= left.endIndex &&
        child.endIndex <= operator.startIndex,
    );
    const rightComments = node.children.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= operator.endIndex &&
        child.endIndex <= right.startIndex,
    );
    const operatorTrailingComments = rightComments.filter(
      (comment) => comment.startPosition.row === operator.endPosition.row,
    );
    const rightOperandComments = rightComments.filter(
      (comment) => comment.startPosition.row !== operator.endPosition.row,
    );
    if (inlineComments.some((comment) => /[\r\n]/.test(comment.text))) {
      throw new Error("Formatting this inline comment syntax is not implemented yet");
    }

    const leftAnalysis = analyzeExpression(left);
    const rightAnalysis = analyzeExpression(right);
    const comments = inlineComments.flatMap((comment) => [text(" "), commentDocument(comment)]);
    const hasSourceRightBreak =
      right.startPosition.row > operator.endPosition.row &&
      (isIndentedExpressionBody(node) ||
        isBlockCombinatorEntry(node) ||
        isOrdinaryBlockResult(node) ||
        isNestedDefinitionBody(node));
    const hasSourceOperatorBreak =
      inlineComments.length === 0 &&
      rightComments.length === 0 &&
      operator.startPosition.row > left.endPosition.row &&
      (isWithinConditionalCondition(node) ||
        isIndentedExpressionBody(node) ||
        isBlockCombinatorEntry(node) ||
        isOrdinaryBlockResult(node) ||
        isNestedDefinitionBody(node));
    const operatorContinuationIndentation = 2;
    return {
      document:
        rightComments.length === 0
          ? hasSourceOperatorBreak
            ? hasSourceRightBreak
              ? concat([
                  leftAnalysis.document,
                  indentBy(
                    concat([hardLine, text(operator.text)]),
                    operatorContinuationIndentation,
                  ),
                  indentBy(concat([hardLine, rightAnalysis.document]), 4),
                ])
              : concat([
                  leftAnalysis.document,
                  indentBy(
                    concat([hardLine, text(`${operator.text} `), rightAnalysis.document]),
                    operatorContinuationIndentation,
                  ),
                ])
            : hasSourceRightBreak
              ? concat([
                  leftAnalysis.document,
                  ...comments,
                  text(` ${operator.text}`),
                  indentBy(concat([hardLine, rightAnalysis.document]), 2),
                ])
              : concat([
                  leftAnalysis.document,
                  ...comments,
                  text(` ${operator.text} `),
                  rightAnalysis.document,
                ])
          : concat([
              leftAnalysis.document,
              ...comments,
              text(` ${operator.text}`),
              ...operatorTrailingComments.flatMap((comment) => [
                text(" "),
                commentDocument(comment),
              ]),
              indent(
                concat([
                  ...rightOperandComments.flatMap((comment) => [
                    hardLine,
                    commentDocument(comment),
                  ]),
                  hardLine,
                  rightAnalysis.document,
                ]),
              ),
            ]),
      binaryOperators: [
        ...leftAnalysis.binaryOperators,
        { node: operator, left, right, inlineComments, rightComments },
        ...rightAnalysis.binaryOperators,
      ],
      unitLiterals: [...leftAnalysis.unitLiterals, ...rightAnalysis.unitLiterals],
      sequenceLiterals: [...leftAnalysis.sequenceLiterals, ...rightAnalysis.sequenceLiterals],
      recordLiterals: [...leftAnalysis.recordLiterals, ...rightAnalysis.recordLiterals],
      callExpressions: [...leftAnalysis.callExpressions, ...rightAnalysis.callExpressions],
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
