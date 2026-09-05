import type Parser from "tree-sitter";
import type {
  AnalyzedModule,
  AnalyzedSource,
  ExpressionAnalysis,
  ModuleDeclaration,
} from "./analysis.js";
import {
  commentDocument,
  leadingCommentsDocument,
  preservesTrailingCommentAlignment,
} from "./comments.js";
import { checkDeclarationLayout } from "./declaration-checker.js";
import type { FormatDiagnostic } from "./diagnostics.js";
import { concat, type Doc, group, hardLine, indent, line, renderDoc, text } from "./document.js";
import { checkFinalNewline } from "./final-newline-checker.js";
import { checkLocalDefinition } from "./local-definition-checker.js";
import { checkModuleLayout } from "./module-checker.js";
import { parseQuint } from "./parser.js";
import { checkPatternSpacing } from "./pattern-checker.js";
import { formatCommentedTuplePattern, formatPattern } from "./pattern-formatter.js";
import { formatExpandedRecordType } from "./record-type-formatter.js";
import {
  checkCommentTrailingWhitespace,
  checkTrailingSourceComments,
} from "./source-comment-checker.js";
import { renderSource } from "./source-renderer.js";
import {
  collectNodes,
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
  preservesDefinitionBodyLineBreak,
  ufcsChainRoot,
  ufcsContinuationIndentation,
} from "./syntax.js";
import { checkTypeDelimiterSpacing } from "./type-checker.js";
import { canFormatType, formatSumVariant, formatType } from "./type-formatter.js";

export { type FormatDiagnostic, renderDiagnostic } from "./diagnostics.js";
export { QuintSyntaxError } from "./parser.js";

function indentBy(document: Doc, levels: number): Doc {
  let indented = document;
  for (let level = 0; level < levels; level += 1) indented = indent(indented);
  return indented;
}

function definitionBodyDocument(
  head: string | Doc,
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  bodyDocument: Doc,
  minimumContinuationIndentation = 1,
): Doc {
  const headDocument = typeof head === "string" ? text(head) : head;
  const comments = definition.namedChildren.filter(
    (child) =>
      (child.type === "comment" || child.type === "documentation_comment") &&
      child.endIndex <= body.startIndex,
  );
  const equals = definition.children.find((child) => child.type === "=");
  const firstContinuationNode = comments[0] ?? body;
  const continuationIndentation = Math.max(
    minimumContinuationIndentation,
    equals &&
      firstContinuationNode.startPosition.row > equals.endPosition.row &&
      firstContinuationNode.startPosition.column - definition.startPosition.column >= 4
      ? 2
      : 1,
  );
  const equalsLineComment =
    equals && comments[0]?.startPosition.row === equals.endPosition.row ? comments[0] : undefined;
  if (comments.length === 0) {
    return preservesDefinitionBodyLineBreak(definition, body)
      ? concat([headDocument, indentBy(concat([hardLine, bodyDocument]), continuationIndentation)])
      : concat([headDocument, text(" "), bodyDocument]);
  }
  if (equalsLineComment) {
    return concat([
      headDocument,
      text(" "),
      commentDocument(equalsLineComment),
      indentBy(
        concat([
          ...comments.slice(1).flatMap((comment) => [hardLine, commentDocument(comment)]),
          hardLine,
          bodyDocument,
        ]),
        continuationIndentation,
      ),
    ]);
  }
  return concat([
    headDocument,
    indentBy(
      concat([
        ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
        hardLine,
        bodyDocument,
      ]),
      continuationIndentation,
    ),
  ]);
}

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

function analyzeExpression(node: Parser.SyntaxNode): ExpressionAnalysis {
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

function analyzeModuleNode(moduleNode: Parser.SyntaxNode): AnalyzedModule {
  const nameNode = moduleNode.childForFieldName("name");

  if (moduleNode.type !== "module_definition" || nameNode?.type !== "identifier") {
    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  const declarations: ModuleDeclaration[] = [];
  let pendingComments: Parser.SyntaxNode[] = [];
  const addDeclaration = (declaration: ModuleDeclaration) => {
    const leadingComments = pendingComments;
    pendingComments = [];
    declarations.push({
      ...declaration,
      leadingComments,
      document: concat([
        leadingCommentsDocument(leadingComments, declaration.node),
        declaration.document,
      ]),
    });
  };

  for (const node of moduleNode.namedChildren) {
    if (node.id === nameNode.id) {
      continue;
    }

    if (node.type === "comment" && node.text.startsWith("//")) {
      const previousDeclaration = declarations.at(-1);
      const previousTrailingComment = previousDeclaration?.trailingComments?.at(-1);
      const continuesTrailingComment = Boolean(
        previousTrailingComment &&
          node.startPosition.row === previousTrailingComment.endPosition.row + 1 &&
          node.startPosition.column === previousTrailingComment.startPosition.column,
      );
      const startsIndentedTrailingComment = Boolean(
        previousDeclaration &&
          !previousTrailingComment &&
          node.startPosition.row === previousDeclaration.node.endPosition.row + 1 &&
          node.startPosition.column > previousDeclaration.node.startPosition.column,
      );
      if (
        previousDeclaration &&
        pendingComments.length === 0 &&
        (node.startPosition.row === previousDeclaration.node.endPosition.row ||
          continuesTrailingComment ||
          startsIndentedTrailingComment)
      ) {
        previousDeclaration.trailingComments = [
          ...(previousDeclaration.trailingComments ?? []),
          node,
        ];
        if (continuesTrailingComment || startsIndentedTrailingComment) {
          previousDeclaration.document = concat([
            previousDeclaration.document,
            hardLine,
            text(
              " ".repeat(
                Math.max(
                  0,
                  node.startPosition.column - previousDeclaration.node.startPosition.column,
                ),
              ),
            ),
            commentDocument(node),
          ]);
          continue;
        }
        const sourceCommentGap = moduleNode.text.slice(
          previousDeclaration.node.endIndex - moduleNode.startIndex,
          node.startIndex - moduleNode.startIndex,
        );
        const preservesAlignment =
          previousDeclaration.valueNode?.type === "sum_type" ||
          preservesTrailingCommentAlignment(sourceCommentGap);
        const commentGap = preservesAlignment ? sourceCommentGap : " ";
        previousDeclaration.document = concat([
          previousDeclaration.document,
          text(commentGap),
          commentDocument(node),
        ]);
        continue;
      }
    }

    if (node.type === "documentation_comment" || node.type === "comment") {
      pendingComments.push(node);
      continue;
    }

    if (node.type === "assumption_declaration") {
      const keyword = node.children.find((child) => child.type === "assume");
      const declarationName = node.childForFieldName("name");
      const condition = node.childForFieldName("condition");
      const equals = node.children.find((child) => child.type === "=");
      if (!keyword || !declarationName || !equals || !condition) {
        throw new Error("Formatting this assumption syntax is not implemented yet");
      }

      const expression = analyzeExpression(condition);
      addDeclaration({
        node,
        keyword,
        nameNode: declarationName,
        equals,
        valueNode: condition,
        binaryOperators: expression.binaryOperators,
        unitLiterals: expression.unitLiterals,
        sequenceLiterals: expression.sequenceLiterals,
        recordLiterals: expression.recordLiterals,
        callExpressions: expression.callExpressions,
        document: definitionBodyDocument(
          `assume ${declarationName.text} =`,
          node,
          condition,
          expression.document,
          2,
        ),
      });
      continue;
    }

    if (node.type === "value_definition") {
      const qualifier = node.childForFieldName("qualifier");
      const keyword = node.children.find((child) => child.type === "val");
      const declarationName = node.childForFieldName("name");
      const declarationType = node.childForFieldName("type");
      const value = node.childForFieldName("value");
      const colon = node.children.find((child) => child.type === ":");
      const equals = node.children.find((child) => child.type === "=");
      const semicolon = node.children.find((child) => child.type === ";");
      if (
        !keyword ||
        !declarationName ||
        !equals ||
        !value ||
        (qualifier && qualifier.type !== "pure") ||
        Boolean(declarationType) !== Boolean(colon)
      ) {
        throw new Error("Formatting this value definition syntax is not implemented yet");
      }

      const expression = analyzeExpression(value);
      const typeAnnotation = declarationType ? `: ${formatType(declarationType)}` : "";
      addDeclaration({
        node,
        qualifier: qualifier ?? undefined,
        keyword,
        nameNode: declarationName,
        colon: colon ?? undefined,
        typeNode: declarationType ?? undefined,
        typeRoots: declarationType ? [declarationType] : undefined,
        semicolon,
        equals,
        valueNode: value,
        binaryOperators: expression.binaryOperators,
        unitLiterals: expression.unitLiterals,
        sequenceLiterals: expression.sequenceLiterals,
        recordLiterals: expression.recordLiterals,
        callExpressions: expression.callExpressions,
        document: definitionBodyDocument(
          `${qualifier ? "pure " : ""}val ${formatPattern(declarationName)}${typeAnnotation} =`,
          node,
          value,
          expression.document,
        ),
      });
      continue;
    }

    if (node.type === "operator_definition") {
      const defKeyword = node.children.find((child) => child.type === "def");
      const qualifier = node.childForFieldName("qualifier");
      const isPureDefinition = defKeyword && (!qualifier || qualifier.type === "pure");
      const isStandaloneDefinition =
        !defKeyword &&
        (qualifier?.type === "action" ||
          qualifier?.type === "run" ||
          qualifier?.type === "temporal" ||
          qualifier?.type === "nondet");
      const keyword = isPureDefinition
        ? defKeyword
        : isStandaloneDefinition
          ? qualifier
          : undefined;
      const declarationName = node.childForFieldName("name");
      const parameters = node.childrenForFieldName("parameter");
      const openParen = node.children.find((child) => child.type === "(");
      const closeParen = node.children.find((child) => child.type === ")");
      const parameterCommas = node.children.filter((child) => child.type === ",");
      const returnType = node.childForFieldName("return_type");
      const returnColon = node.children.find((child) => child.type === ":");
      const semicolon = node.children.find((child) => child.type === ";");
      const body = node.childForFieldName("body");
      const equals = node.children.find((child) => child.type === "=");
      const parameterNames = parameters.map((parameter) => parameter.childForFieldName("name"));
      const parameterTypes = parameters.map((parameter) => parameter.childForFieldName("type"));
      const parameterColons = parameters.map((parameter) =>
        parameter.children.find((child) => child.type === ":"),
      );
      const parametersAreUntyped = parameterTypes.every(
        (parameterType, index) => !parameterType && !parameterColons[index],
      );
      const parametersAreTyped = parameterTypes.every(
        (parameterType, index) =>
          Boolean(parameterType && canFormatType(parameterType)) && Boolean(parameterColons[index]),
      );
      const hasSupportedParameters =
        parameters.length === 0
          ? (!openParen && !closeParen) || Boolean(openParen && closeParen)
          : Boolean(openParen) &&
            Boolean(closeParen) &&
            (parameterCommas.length === parameters.length - 1 ||
              parameterCommas.length === parameters.length) &&
            parameterNames.every(
              (parameterName) =>
                parameterName?.type === "identifier" || parameterName?.type === "hole",
            ) &&
            (parametersAreUntyped || parametersAreTyped);
      const hasSupportedReturnType = returnType
        ? canFormatType(returnType) &&
          Boolean(returnColon) &&
          (parametersAreTyped || parametersAreUntyped)
        : !returnColon && parametersAreUntyped;
      if (
        !keyword ||
        !declarationName ||
        !equals ||
        !body ||
        !hasSupportedParameters ||
        !hasSupportedReturnType ||
        (!isPureDefinition && !isStandaloneDefinition)
      ) {
        throw new Error("Formatting this operator definition syntax is not implemented yet");
      }

      const expression = analyzeExpression(body);
      const definitionHead = isStandaloneDefinition
        ? qualifier.text
        : `${qualifier ? `${qualifier.text} ` : ""}def`;
      const formattedParameters = parameterNames.map((parameterName, index) => {
        const parameterType = parameterTypes[index];
        return `${parameterName?.text}${parameterType ? `: ${formatType(parameterType)}` : ""}`;
      });
      const parameterList = openParen && closeParen ? `(${formattedParameters.join(", ")})` : "";
      const returnTypeAnnotation = returnType ? `: ${formatType(returnType)}` : "";
      const inlineDefinitionHead = `${definitionHead} ${declarationName.text}${parameterList}${returnTypeAnnotation} =`;
      const usesExpandedParameterList = Boolean(
        openParen &&
          closeParen &&
          parameters.length > 0 &&
          (openParen.startPosition.row < closeParen.endPosition.row ||
            inlineDefinitionHead.length + 2 > 120),
      );
      const definitionHeadDocument = usesExpandedParameterList
        ? concat([
            text(`${definitionHead} ${declarationName.text}(`),
            indent(
              concat(formattedParameters.flatMap((parameter) => [hardLine, text(`${parameter},`)])),
            ),
            hardLine,
            text(`)${returnTypeAnnotation} =`),
          ])
        : text(inlineDefinitionHead);
      addDeclaration({
        node,
        qualifier: isPureDefinition ? (qualifier ?? undefined) : undefined,
        keyword,
        nameNode: declarationName,
        colon: returnColon,
        typeNode: returnType ?? undefined,
        typeAnchor: closeParen ?? declarationName,
        typeRoots: [
          ...parameterTypes.filter((type) => type !== null),
          ...(returnType ? [returnType] : []),
        ],
        openParen,
        closeParen,
        parameters,
        parameterCommas,
        expandedParameterList: usesExpandedParameterList,
        semicolon,
        equals,
        valueNode: body,
        binaryOperators: expression.binaryOperators,
        unitLiterals: expression.unitLiterals,
        sequenceLiterals: expression.sequenceLiterals,
        recordLiterals: expression.recordLiterals,
        callExpressions: expression.callExpressions,
        document: definitionBodyDocument(definitionHeadDocument, node, body, expression.document),
      });
      continue;
    }

    if (node.type === "type_alias_declaration") {
      const keyword = node.children.find((child) => child.type === "type");
      const declarationName = node.childForFieldName("name");
      const value = node.childForFieldName("value");
      const equals = node.children.find((child) => child.type === "=");
      const typeParameters = node.childrenForFieldName("parameter");
      const typeOpenBracket = node.children.find((child) => child.type === "[");
      const typeCloseBracket = node.children.find((child) => child.type === "]");
      const typeParameterCommas = node.children.filter((child) => child.type === ",");
      const typeParameterNames = typeParameters.map((parameter) =>
        parameter.childForFieldName("name"),
      );
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

      addDeclaration({
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
      });
      continue;
    }

    if (node.type === "uninterpreted_type_declaration") {
      const keyword = node.children.find((child) => child.type === "type");
      const declarationName = node.childForFieldName("name");
      if (!keyword || !declarationName) {
        throw new Error("Formatting this uninterpreted type syntax is not implemented yet");
      }

      addDeclaration({
        node,
        keyword,
        nameNode: declarationName,
        document: text(`type ${declarationName.text}`),
      });
      continue;
    }

    if (node.type === "instance_declaration") {
      const keyword = node.children.find((child) => child.type === "import");
      const importedModule = node.childForFieldName("module");
      const openParen = node.children.find((child) => child.type === "(");
      const closeParen = node.children.find((child) => child.type === ")");
      const overrides = node.namedChildren.filter((child) => child.type === "instance_override");
      const commas = node.children.filter((child) => child.type === ",");
      const alias = node.childForFieldName("alias");
      const asKeyword = node.children.find((child) => child.type === "as");
      const sourceNode = node.childForFieldName("source");
      const fromKeyword = node.children.find((child) => child.type === "from");
      if (
        !keyword ||
        !importedModule ||
        !openParen ||
        !closeParen ||
        Boolean(alias) !== Boolean(asKeyword) ||
        Boolean(sourceNode) !== Boolean(fromKeyword)
      ) {
        throw new Error("Unable to locate the module instance declaration");
      }
      const overrideAnalyses = overrides.map((override) => {
        const overrideName = override.childForFieldName("name");
        const value = override.childForFieldName("value");
        if (!overrideName || !value) throw new Error("Unable to locate the instance override");
        return { node: override, name: overrideName, value: analyzeExpression(value) };
      });
      const hasComments = node.namedChildren.some(
        (child) => child.type === "comment" || child.type === "documentation_comment",
      );
      const firstOverride = overrides[0];
      const lastOverride = overrides.at(-1);
      const isExpandedInstance = Boolean(
        firstOverride &&
          lastOverride &&
          firstOverride.startPosition.row > openParen.endPosition.row &&
          closeParen.startPosition.row > lastOverride.endPosition.row,
      );
      const overrideDocuments: Doc[] = [];
      if (hasComments) {
        let previousOverride: (typeof overrideAnalyses)[number] | undefined;
        for (const child of node.namedChildren.filter(
          (candidate) =>
            candidate.id !== importedModule.id &&
            candidate.id !== alias?.id &&
            candidate.id !== sourceNode?.id,
        )) {
          if (child.type === "comment" || child.type === "documentation_comment") {
            const isTrailingOverrideComment =
              previousOverride?.node.endPosition.row === child.startPosition.row;
            if (isTrailingOverrideComment && previousOverride) {
              const previousDocument = overrideDocuments.pop();
              if (!previousDocument) {
                throw new Error("Unable to attach the trailing instance override comment");
              }
              const previousIndex = overrideAnalyses.findIndex(
                (override) => override.node.id === previousOverride?.node.id,
              );
              const comma = commas[previousIndex];
              const commentAnchor =
                comma && comma.endIndex <= child.startIndex ? comma : previousOverride.node;
              const commentGap = node.text.slice(
                commentAnchor.endIndex - node.startIndex,
                child.startIndex - node.startIndex,
              );
              overrideDocuments.push(
                concat([previousDocument, text(commentGap), commentDocument(child)]),
              );
            } else {
              overrideDocuments.push(commentDocument(child));
            }
            previousOverride = undefined;
            continue;
          }
          const index = overrideAnalyses.findIndex((override) => override.node.id === child.id);
          const override = overrideAnalyses[index];
          if (!override) {
            throw new Error("Formatting this instance override content is not implemented yet");
          }
          overrideDocuments.push(
            concat([
              text(`${formatPattern(override.name)} = `),
              override.value.document,
              ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
            ]),
          );
          previousOverride = override;
        }
      }
      addDeclaration({
        node,
        keyword,
        nameNode: importedModule,
        aliasNode: alias ?? undefined,
        asKeyword,
        fromKeyword,
        sourceNode: sourceNode ?? undefined,
        instanceOpenParen: openParen,
        instanceCloseParen: closeParen,
        instanceOverrides: overrides,
        instanceCommas: commas,
        binaryOperators: overrideAnalyses.flatMap(({ value }) => value.binaryOperators),
        unitLiterals: overrideAnalyses.flatMap(({ value }) => value.unitLiterals),
        sequenceLiterals: overrideAnalyses.flatMap(({ value }) => value.sequenceLiterals),
        recordLiterals: overrideAnalyses.flatMap(({ value }) => value.recordLiterals),
        callExpressions: overrideAnalyses.flatMap(({ value }) => value.callExpressions),
        document: hasComments
          ? concat([
              text(`import ${formatPattern(importedModule)}(`),
              indent(concat(overrideDocuments.flatMap((document) => [hardLine, document]))),
              hardLine,
              text(
                `)${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`,
              ),
            ])
          : isExpandedInstance
            ? concat([
                text(`import ${formatPattern(importedModule)}(`),
                indent(
                  concat(
                    overrideAnalyses.flatMap(({ name, value }, index) => [
                      hardLine,
                      text(`${formatPattern(name)} = `),
                      value.document,
                      ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
                    ]),
                  ),
                ),
                hardLine,
                text(
                  `)${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`,
                ),
              ])
            : concat([
                text(`import ${formatPattern(importedModule)}(`),
                ...overrideAnalyses.flatMap(({ name, value }, index) => [
                  ...(index === 0 ? [] : [text(", ")]),
                  text(`${formatPattern(name)} = `),
                  value.document,
                ]),
                text(
                  `)${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`,
                ),
              ]),
      });
      continue;
    }

    if (node.type === "anonymous_instance_declaration") {
      const keyword = node.children.find((child) => child.type === "import");
      const importedModule = node.childForFieldName("module");
      const openParen = node.children.find((child) => child.type === "(");
      const closeParen = node.children.find((child) => child.type === ")");
      const dot = node.children.find((child) => child.type === ".");
      const star = node.children.find((child) => child.type === "*");
      const overrides = node.namedChildren.filter((child) => child.type === "instance_override");
      const commas = node.children.filter((child) => child.type === ",");
      const sourceNode = node.childForFieldName("source");
      const fromKeyword = node.children.find((child) => child.type === "from");
      if (
        !keyword ||
        !importedModule ||
        !openParen ||
        !closeParen ||
        !dot ||
        !star ||
        Boolean(sourceNode) !== Boolean(fromKeyword)
      ) {
        throw new Error("Unable to locate the anonymous instance declaration");
      }
      const overrideAnalyses = overrides.map((override) => {
        const overrideName = override.childForFieldName("name");
        const value = override.childForFieldName("value");
        if (!overrideName || !value) throw new Error("Unable to locate the instance override");
        return { node: override, name: overrideName, value: analyzeExpression(value) };
      });
      const hasComments = node.namedChildren.some(
        (child) => child.type === "comment" || child.type === "documentation_comment",
      );
      const firstOverride = overrides[0];
      const lastOverride = overrides.at(-1);
      const isExpandedInstance = Boolean(
        firstOverride &&
          lastOverride &&
          firstOverride.startPosition.row > openParen.endPosition.row &&
          closeParen.startPosition.row > lastOverride.endPosition.row,
      );
      const overrideDocuments: Doc[] = [];
      if (hasComments) {
        let previousOverride: (typeof overrideAnalyses)[number] | undefined;
        for (const child of node.namedChildren.filter(
          (candidate) => candidate.id !== importedModule.id && candidate.id !== sourceNode?.id,
        )) {
          if (child.type === "comment" || child.type === "documentation_comment") {
            const isTrailingOverrideComment =
              previousOverride?.node.endPosition.row === child.startPosition.row;
            if (isTrailingOverrideComment && previousOverride) {
              const previousDocument = overrideDocuments.pop();
              if (!previousDocument) {
                throw new Error("Unable to attach the trailing anonymous override comment");
              }
              const previousIndex = overrideAnalyses.findIndex(
                (override) => override.node.id === previousOverride?.node.id,
              );
              const comma = commas[previousIndex];
              const commentAnchor =
                comma && comma.endIndex <= child.startIndex ? comma : previousOverride.node;
              const commentGap = node.text.slice(
                commentAnchor.endIndex - node.startIndex,
                child.startIndex - node.startIndex,
              );
              overrideDocuments.push(
                concat([previousDocument, text(commentGap), commentDocument(child)]),
              );
            } else {
              overrideDocuments.push(commentDocument(child));
            }
            previousOverride = undefined;
            continue;
          }
          const index = overrideAnalyses.findIndex((override) => override.node.id === child.id);
          const override = overrideAnalyses[index];
          if (!override) {
            throw new Error("Formatting this anonymous override content is not implemented yet");
          }
          overrideDocuments.push(
            concat([
              text(`${formatPattern(override.name)} = `),
              override.value.document,
              ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
            ]),
          );
          previousOverride = override;
        }
      }
      addDeclaration({
        node,
        keyword,
        nameNode: importedModule,
        dot,
        selectorNode: star,
        fromKeyword,
        sourceNode: sourceNode ?? undefined,
        instanceOpenParen: openParen,
        instanceCloseParen: closeParen,
        instanceOverrides: overrides,
        instanceCommas: commas,
        binaryOperators: overrideAnalyses.flatMap(({ value }) => value.binaryOperators),
        unitLiterals: overrideAnalyses.flatMap(({ value }) => value.unitLiterals),
        sequenceLiterals: overrideAnalyses.flatMap(({ value }) => value.sequenceLiterals),
        recordLiterals: overrideAnalyses.flatMap(({ value }) => value.recordLiterals),
        callExpressions: overrideAnalyses.flatMap(({ value }) => value.callExpressions),
        document: hasComments
          ? concat([
              text(`import ${formatPattern(importedModule)}(`),
              indent(concat(overrideDocuments.flatMap((document) => [hardLine, document]))),
              hardLine,
              text(`).*${sourceNode ? ` from ${sourceNode.text}` : ""}`),
            ])
          : isExpandedInstance
            ? concat([
                text(`import ${formatPattern(importedModule)}(`),
                indent(
                  concat(
                    overrideAnalyses.flatMap(({ name, value }, index) => [
                      hardLine,
                      text(`${formatPattern(name)} = `),
                      value.document,
                      ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
                    ]),
                  ),
                ),
                hardLine,
                text(`).*${sourceNode ? ` from ${sourceNode.text}` : ""}`),
              ])
            : concat([
                text(`import ${formatPattern(importedModule)}(`),
                ...overrideAnalyses.flatMap(({ name, value }, index) => [
                  ...(index === 0 ? [] : [text(", ")]),
                  text(`${formatPattern(name)} = `),
                  value.document,
                ]),
                text(`).*${sourceNode ? ` from ${sourceNode.text}` : ""}`),
              ]),
      });
      continue;
    }

    if (
      node.type === "module_import_declaration" ||
      node.type === "module_export_declaration" ||
      node.type === "named_import_declaration" ||
      node.type === "named_export_declaration" ||
      node.type === "wildcard_import_declaration" ||
      node.type === "wildcard_export_declaration"
    ) {
      const keywordType = node.type.includes("import") ? "import" : "export";
      const keyword = node.children.find((child) => child.type === keywordType);
      const importedModule = node.childForFieldName("module");
      const alias = node.childForFieldName("alias");
      const name = node.childForFieldName("name");
      const asKeyword = node.children.find((child) => child.type === "as");
      const dot = node.children.find((child) => child.type === ".");
      const star = node.children.find((child) => child.type === "*");
      const fromKeyword = node.children.find((child) => child.type === "from");
      const sourceNode = node.childForFieldName("source");
      const selector = name ?? star;
      if (
        !keyword ||
        !importedModule ||
        Boolean(alias) !== Boolean(asKeyword) ||
        Boolean(sourceNode) !== Boolean(fromKeyword)
      ) {
        throw new Error("Unable to locate the import or export declaration");
      }
      if (node.type.startsWith("named_") && (!dot || !name)) {
        throw new Error("Unable to locate the named import or export selector");
      }
      if (node.type.startsWith("wildcard_") && (!dot || !star)) {
        throw new Error("Unable to locate the wildcard import or export selector");
      }
      addDeclaration({
        node,
        keyword,
        nameNode: importedModule,
        aliasNode: alias ?? undefined,
        asKeyword,
        dot,
        selectorNode: selector ?? undefined,
        fromKeyword,
        sourceNode: sourceNode ?? undefined,
        document: text(
          `${keywordType} ${formatPattern(importedModule)}${dot && selector ? `.${selector.type === "*" ? "*" : formatPattern(selector)}` : ""}${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`,
        ),
      });
      continue;
    }

    const keywordType =
      node.type === "variable_declaration"
        ? "var"
        : node.type === "constant_declaration"
          ? "const"
          : undefined;
    if (!keywordType) {
      throw new Error("Formatting this Quint syntax is not implemented yet");
    }

    const declarationName = node.childForFieldName("name");
    const declarationType = node.childForFieldName("type");
    const keyword = node.children.find((child) => child.type === keywordType);
    const colon = node.children.find((child) => child.type === ":");
    if (!declarationName || !declarationType || !keyword || !colon) {
      throw new Error("Unable to locate the variable declaration fields");
    }
    const sourceTypeGap = node.text.slice(
      colon.endIndex - node.startIndex,
      declarationType.startIndex - node.startIndex,
    );
    const typeGap = /^ +$/u.test(sourceTypeGap) ? sourceTypeGap : " ";

    addDeclaration({
      node,
      keyword,
      nameNode: declarationName,
      colon,
      typeNode: declarationType,
      typeRoots: [declarationType],
      document: text(
        `${keywordType} ${declarationName.text}:${typeGap}${formatType(declarationType)}`,
      ),
    });
  }

  const danglingComments = pendingComments;

  const openBrace = moduleNode.children.find((child) => child.type === "{");
  const closeBrace = moduleNode.children.find((child) => child.type === "}");
  const moduleKeyword = moduleNode.children.find((child) => child.type === "module");

  if (!openBrace || !closeBrace || !moduleKeyword) {
    throw new Error("Unable to locate the empty module tokens");
  }

  return {
    node: moduleNode,
    name: nameNode.text,
    nameNode,
    moduleKeyword,
    openBrace,
    closeBrace,
    declarations,
    danglingComments,
  };
}

function analyzeSource(source: string): AnalyzedSource {
  const root = parseQuint(source);
  let hashbang: Parser.SyntaxNode | undefined;
  let pendingComments: Parser.SyntaxNode[] = [];
  const modules: AnalyzedSource["modules"] = [];

  for (const node of root.namedChildren) {
    if (
      node.type === "hashbang" &&
      !hashbang &&
      modules.length === 0 &&
      pendingComments.length === 0
    ) {
      hashbang = node;
      continue;
    }

    if (node.type === "documentation_comment" || node.type === "comment") {
      pendingComments.push(node);
      continue;
    }

    if (node.type === "module_definition") {
      modules.push({ ...analyzeModuleNode(node), leadingComments: pendingComments });
      pendingComments = [];
      continue;
    }

    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  if (modules.length === 0) {
    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  return { hashbang, modules, trailingComments: pendingComments };
}

export function formatQuint(source: string): string {
  return renderSource(analyzeSource(source));
}

export function checkQuint(source: string, filePath: string): FormatDiagnostic[] {
  const analyzedSource = analyzeSource(source);
  const formatted = renderSource(analyzedSource);
  const diagnostics: FormatDiagnostic[] = [];

  if (source === formatted) {
    return [];
  }

  const lines = source.split(/\r?\n/);
  diagnostics.push(...checkCommentTrailingWhitespace(analyzedSource, filePath, lines));
  for (const [moduleIndex, module] of analyzedSource.modules.entries()) {
    const previousModule = moduleIndex > 0 ? analyzedSource.modules[moduleIndex - 1] : undefined;
    diagnostics.push(...checkModuleLayout(module, previousModule, source, filePath, lines));

    for (const [index, declaration] of module.declarations.entries()) {
      const previousDeclaration = index > 0 ? module.declarations[index - 1] : undefined;
      diagnostics.push(
        ...checkDeclarationLayout(declaration, previousDeclaration, source, filePath, lines),
      );

      if (declaration.dot && declaration.selectorNode) {
        const selectorAnchor = declaration.instanceCloseParen ?? declaration.nameNode;
        const beforeDot = source.slice(selectorAnchor.endIndex, declaration.dot.startIndex);
        const afterDot = source.slice(
          declaration.dot.endIndex,
          declaration.selectorNode.startIndex,
        );
        if (beforeDot !== "" || afterDot !== "") {
          const row = declaration.dot.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.dot.startPosition.column + 1,
            length: 1,
            rule: "format/import-selector-spacing",
            message: "expected no space around '.'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.aliasNode && declaration.asKeyword) {
        const aliasAnchor = declaration.instanceCloseParen ?? declaration.nameNode;
        const beforeAs = source.slice(aliasAnchor.endIndex, declaration.asKeyword.startIndex);
        const afterAs = source.slice(
          declaration.asKeyword.endIndex,
          declaration.aliasNode.startIndex,
        );
        if (beforeAs !== " " || afterAs !== " ") {
          const row = declaration.asKeyword.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.asKeyword.startPosition.column + 1,
            length: 2,
            rule: "format/import-alias-spacing",
            message: "expected one space around 'as'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.sourceNode && declaration.fromKeyword) {
        const sourceAnchor =
          declaration.aliasNode ??
          declaration.selectorNode ??
          declaration.instanceCloseParen ??
          declaration.nameNode;
        const beforeFrom = source.slice(sourceAnchor.endIndex, declaration.fromKeyword.startIndex);
        const afterFrom = source.slice(
          declaration.fromKeyword.endIndex,
          declaration.sourceNode.startIndex,
        );
        if (beforeFrom !== " " || afterFrom !== " ") {
          const row = declaration.fromKeyword.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.fromKeyword.startPosition.column + 1,
            length: 4,
            rule: "format/import-source-spacing",
            message: "expected one space around 'from'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.instanceOpenParen && declaration.instanceCloseParen) {
        const overrides = declaration.instanceOverrides ?? [];
        const afterModule = source.slice(
          declaration.nameNode.endIndex,
          declaration.instanceOpenParen.startIndex,
        );
        const first = overrides[0];
        const last = overrides.at(-1);
        const insideStart = first
          ? source.slice(declaration.instanceOpenParen.endIndex, first.startIndex)
          : source.slice(
              declaration.instanceOpenParen.endIndex,
              declaration.instanceCloseParen.startIndex,
            );
        const insideEnd = last
          ? source.slice(last.endIndex, declaration.instanceCloseParen.startIndex)
          : "";
        const isExpandedInstance = Boolean(
          first &&
            last &&
            first.startPosition.row > declaration.instanceOpenParen.endPosition.row &&
            declaration.instanceCloseParen.startPosition.row > last.endPosition.row,
        );
        const hasCanonicalDelimiters = isExpandedInstance
          ? afterModule === "" &&
            first?.startPosition.column === declaration.node.startPosition.column + 2 &&
            declaration.instanceCloseParen.startPosition.column ===
              declaration.node.startPosition.column
          : afterModule === "" && insideStart === "" && insideEnd === "";
        if (!hasCanonicalDelimiters) {
          const row = declaration.instanceOpenParen.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.instanceOpenParen.startPosition.column + 1,
            length: 1,
            rule: "format/instance-delimiter-spacing",
            message: isExpandedInstance
              ? "expected expanded instance overrides with two-space indentation"
              : "expected no space around instance parentheses",
            sourceLine: lines[row] ?? "",
          });
        }
        for (const override of overrides) {
          const overrideName = override.childForFieldName("name");
          const value = override.childForFieldName("value");
          const equals = override.children.find((child) => child.type === "=");
          if (!overrideName || !value || !equals) {
            throw new Error("Unable to locate the instance override syntax");
          }
          if (
            source.slice(overrideName.endIndex, equals.startIndex) !== " " ||
            source.slice(equals.endIndex, value.startIndex) !== " "
          ) {
            const row = equals.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: equals.startPosition.column + 1,
              length: 1,
              rule: "format/instance-override-spacing",
              message: "expected one space around '='",
              sourceLine: lines[row] ?? "",
            });
          }
        }
        for (const [index, comma] of (declaration.instanceCommas ?? []).entries()) {
          const previous = overrides[index];
          const next = overrides[index + 1];
          if (!previous || !next) {
            const row = comma.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: comma.startPosition.column + 1,
              length: 1,
              rule: "format/instance-trailing-comma",
              message: "trailing commas are omitted from inline instances",
              sourceLine: lines[row] ?? "",
            });
          } else if (
            source.slice(previous.endIndex, comma.startIndex) !== "" ||
            (isExpandedInstance
              ? !/^\r?\n[\t ]*$/.test(source.slice(comma.endIndex, next.startIndex)) ||
                next.startPosition.column !== declaration.node.startPosition.column + 2
              : source.slice(comma.endIndex, next.startIndex) !== " ")
          ) {
            const row = comma.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: comma.startPosition.column + 1,
              length: 1,
              rule: "format/instance-override-separator-spacing",
              message: isExpandedInstance
                ? "expected each instance override on its own indented line"
                : "expected ', ' between instance overrides",
              sourceLine: lines[row] ?? "",
            });
          }
        }
      }

      if (
        declaration.typeOpenBracket &&
        declaration.typeCloseBracket &&
        declaration.typeParameters?.length
      ) {
        const firstParameter = declaration.typeParameters[0];
        const lastParameter = declaration.typeParameters.at(-1);
        if (!firstParameter || !lastParameter) {
          throw new Error("Unable to locate the type parameters");
        }

        const beforeOpenBracket = source.slice(
          declaration.nameNode.endIndex,
          declaration.typeOpenBracket.startIndex,
        );
        if (beforeOpenBracket !== "") {
          const row = declaration.typeOpenBracket.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.nameNode.endPosition.column + 1,
            length: Math.max(1, beforeOpenBracket.length),
            rule: "format/type-parameter-list-spacing",
            message: "expected no space before '['",
            sourceLine: lines[row] ?? "",
          });
        }

        const afterOpenBracket = source.slice(
          declaration.typeOpenBracket.endIndex,
          firstParameter.startIndex,
        );
        if (afterOpenBracket !== "") {
          const row = declaration.typeOpenBracket.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.typeOpenBracket.endPosition.column + 1,
            length: Math.max(1, afterOpenBracket.length),
            rule: "format/type-parameter-list-spacing",
            message: "expected no space after '['",
            sourceLine: lines[row] ?? "",
          });
        }

        for (const [index, comma] of (declaration.typeParameterCommas ?? []).entries()) {
          const previousParameter = declaration.typeParameters[index];
          const nextParameter = declaration.typeParameters[index + 1];
          if (!previousParameter || !nextParameter) {
            throw new Error("Unable to locate type parameters around ','");
          }
          const beforeComma = source.slice(previousParameter.endIndex, comma.startIndex);
          const afterComma = source.slice(comma.endIndex, nextParameter.startIndex);
          if (beforeComma !== "" || afterComma !== " ") {
            const row = comma.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: comma.startPosition.column + 1,
              length: 1,
              rule: "format/type-parameter-separator-spacing",
              message: "expected ', ' between type parameters",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        const beforeCloseBracket = source.slice(
          lastParameter.endIndex,
          declaration.typeCloseBracket.startIndex,
        );
        if (beforeCloseBracket !== "") {
          const row = declaration.typeCloseBracket.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: lastParameter.endPosition.column + 1,
            length: Math.max(1, beforeCloseBracket.length),
            rule: "format/type-parameter-list-spacing",
            message: "expected no space before ']'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      for (const parameter of declaration.parameters ?? []) {
        const parameterName = parameter.childForFieldName("name");
        const parameterType = parameter.childForFieldName("type");
        const parameterColon = parameter.children.find((child) => child.type === ":");
        if (!parameterName || !parameterType || !parameterColon) {
          continue;
        }

        const colonGap = source.slice(parameterName.endIndex, parameterColon.startIndex);
        if (colonGap.length > 0) {
          const row = parameterName.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: parameterName.endPosition.column + 1,
            length: Math.max(
              1,
              parameterColon.startPosition.column - parameterName.endPosition.column,
            ),
            rule: "format/type-colon-spacing",
            message: "expected no space before ':'",
            sourceLine: lines[row] ?? "",
          });
        }

        const typeGap = source.slice(parameterColon.endIndex, parameterType.startIndex);
        if (typeGap !== " ") {
          const row = parameterColon.endPosition.row;
          const hasGap = parameterType.startPosition.column > parameterColon.endPosition.column;
          diagnostics.push({
            filePath,
            line: row + 1,
            column:
              (hasGap ? parameterColon.endPosition.column : parameterType.startPosition.column) + 1,
            length: Math.max(
              1,
              parameterType.startPosition.column - parameterColon.endPosition.column,
            ),
            rule: "format/type-colon-spacing",
            message: "expected one space after ':'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.colon && declaration.typeNode) {
        const typeAnchor = declaration.typeAnchor ?? declaration.nameNode;
        const colonGap = source.slice(typeAnchor.endIndex, declaration.colon.startIndex);
        if (colonGap.length > 0) {
          const row = typeAnchor.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: typeAnchor.endPosition.column + 1,
            length: Math.max(
              1,
              declaration.colon.startPosition.column - typeAnchor.endPosition.column,
            ),
            rule: "format/type-colon-spacing",
            message: "expected no space before ':'",
            sourceLine: lines[row] ?? "",
          });
        }

        const typeGap = source.slice(declaration.colon.endIndex, declaration.typeNode.startIndex);
        const preservesDeclarationAlignment =
          (declaration.keyword.type === "var" || declaration.keyword.type === "const") &&
          /^ +$/u.test(typeGap);
        if (typeGap !== " " && !preservesDeclarationAlignment) {
          const row = declaration.colon.endPosition.row;
          const hasGap =
            declaration.typeNode.startPosition.column > declaration.colon.endPosition.column;
          diagnostics.push({
            filePath,
            line: row + 1,
            column:
              (hasGap
                ? declaration.colon.endPosition.column
                : declaration.typeNode.startPosition.column) + 1,
            length: Math.max(
              1,
              declaration.typeNode.startPosition.column - declaration.colon.endPosition.column,
            ),
            rule: "format/type-colon-spacing",
            message: "expected one space after ':'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      for (const typeRoot of declaration.typeRoots ?? []) {
        checkTypeDelimiterSpacing(typeRoot, source, lines, filePath, diagnostics);
      }

      checkPatternSpacing(declaration.nameNode, source, lines, filePath, diagnostics);

      if (declaration.openParen && declaration.closeParen && declaration.parameters?.length === 0) {
        const beforeOpenParen = source.slice(
          declaration.nameNode.endIndex,
          declaration.openParen.startIndex,
        );
        const insideParentheses = source.slice(
          declaration.openParen.endIndex,
          declaration.closeParen.startIndex,
        );
        if (beforeOpenParen !== "" || insideParentheses !== "") {
          const row = declaration.openParen.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.openParen.startPosition.column + 1,
            length: 1,
            rule: "format/parameter-list-spacing",
            message: "expected no space around an empty parameter list",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.openParen && declaration.closeParen && declaration.parameters?.length) {
        const firstParameter = declaration.parameters[0];
        const lastParameter = declaration.parameters.at(-1);
        if (!firstParameter || !lastParameter) {
          throw new Error("Unable to locate the definition parameters");
        }
        const beforeOpenParen = source.slice(
          declaration.nameNode.endIndex,
          declaration.openParen.startIndex,
        );
        if (beforeOpenParen !== "") {
          const row = declaration.openParen.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.nameNode.endPosition.column + 1,
            length: Math.max(1, beforeOpenParen.length),
            rule: "format/parameter-list-spacing",
            message: "expected no space before '('",
            sourceLine: lines[row] ?? "",
          });
        }

        if (declaration.expandedParameterList) {
          const parameterIndent = declaration.keyword.startPosition.column + 2;
          const hasCanonicalBreak = (left: Parser.SyntaxNode, right: Parser.SyntaxNode) =>
            right.startPosition.row === left.endPosition.row + 1 &&
            right.startPosition.column === parameterIndent;
          if (!hasCanonicalBreak(declaration.openParen, firstParameter)) {
            const row = firstParameter.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: firstParameter.startPosition.column + 1,
              length: Math.max(1, firstParameter.text.length),
              rule: "format/multiline-parameter-layout",
              message: "expected the first parameter on an indented line",
              sourceLine: lines[row] ?? "",
            });
          }

          const commas = declaration.parameterCommas ?? [];
          for (const [index, parameter] of declaration.parameters.entries()) {
            const comma = commas[index];
            const next = declaration.parameters[index + 1] ?? declaration.closeParen;
            if (
              !comma ||
              comma.startIndex < parameter.endIndex ||
              comma.endIndex > next.startIndex
            ) {
              const row = parameter.endPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: parameter.endPosition.column + 1,
                length: 1,
                rule: "format/multiline-parameter-layout",
                message: "expected a trailing comma after the parameter",
                sourceLine: lines[row] ?? "",
              });
              continue;
            }
            if (
              source.slice(parameter.endIndex, comma.startIndex) !== "" ||
              !hasCanonicalBreak(comma, next)
            ) {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/multiline-parameter-layout",
                message:
                  next.id === declaration.closeParen.id
                    ? "expected the closing parenthesis on its own line"
                    : "expected one parameter per indented line",
                sourceLine: lines[row] ?? "",
              });
            }
          }
        } else {
          const afterOpenParen = source.slice(
            declaration.openParen.endIndex,
            firstParameter.startIndex,
          );
          if (afterOpenParen !== "") {
            const row = declaration.openParen.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: declaration.openParen.endPosition.column + 1,
              length: Math.max(1, afterOpenParen.length),
              rule: "format/parameter-list-spacing",
              message: "expected no space after '('",
              sourceLine: lines[row] ?? "",
            });
          }

          for (const [index, comma] of (declaration.parameterCommas ?? []).entries()) {
            const previousParameter = declaration.parameters[index];
            const nextParameter = declaration.parameters[index + 1];
            if (!previousParameter || !nextParameter) {
              throw new Error("Unable to locate parameters around ','");
            }
            const beforeComma = source.slice(previousParameter.endIndex, comma.startIndex);
            const afterComma = source.slice(comma.endIndex, nextParameter.startIndex);
            if (beforeComma !== "" || afterComma !== " ") {
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

          const beforeCloseParen = source.slice(
            lastParameter.endIndex,
            declaration.closeParen.startIndex,
          );
          if (beforeCloseParen !== "") {
            const row = declaration.closeParen.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: lastParameter.endPosition.column + 1,
              length: Math.max(1, beforeCloseParen.length),
              rule: "format/parameter-list-spacing",
              message: "expected no space before ')'",
              sourceLine: lines[row] ?? "",
            });
          }
        }
      }

      if (declaration.equals && declaration.valueNode) {
        const equalsAnchor =
          declaration.typeNode ??
          declaration.closeParen ??
          declaration.typeCloseBracket ??
          declaration.nameNode;
        const beforeEquals = source.slice(equalsAnchor.endIndex, declaration.equals.startIndex);
        const afterEquals = source.slice(
          declaration.equals.endIndex,
          declaration.valueNode.startIndex,
        );
        const isMultilineSum =
          declaration.valueNode.type === "sum_type" &&
          declaration.valueNode.startPosition.row < declaration.valueNode.endPosition.row;
        const requiresLineBreakAfterEquals =
          isMultilineSum ||
          preservesDefinitionBodyLineBreak(declaration.node, declaration.valueNode);
        const hasCanonicalAfterEquals = requiresLineBreakAfterEquals
          ? /^(?:\r\n|\r|\n)[\t ]*$/.test(afterEquals)
          : afterEquals === " ";
        if (beforeEquals !== " " || !hasCanonicalAfterEquals) {
          const row = declaration.equals.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.equals.startPosition.column + 1,
            length: 1,
            rule: "format/equals-spacing",
            message: requiresLineBreakAfterEquals
              ? "expected a line break after '='"
              : "expected one space around '='",
            sourceLine: lines[row] ?? "",
          });
        }
        if (
          declaration.node.type === "assumption_declaration" &&
          declaration.valueNode.startPosition.row > declaration.equals.endPosition.row &&
          declaration.valueNode.startPosition.column !== declaration.node.startPosition.column + 4
        ) {
          const row = declaration.valueNode.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: 1,
            length: Math.max(1, declaration.valueNode.startPosition.column),
            rule: "format/definition-body-indentation",
            message: "expected a four-space continuation indent",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.semicolon) {
        const row = declaration.semicolon.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: declaration.semicolon.startPosition.column + 1,
          length: 1,
          rule: "format/unnecessary-semicolon",
          message: "optional semicolons are omitted",
          sourceLine: lines[row] ?? "",
        });
      }

      for (const operator of declaration.binaryOperators ?? []) {
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
        const preservesLeadingOperatorBreak =
          operator.inlineComments.length === 0 &&
          operator.rightComments.length === 0 &&
          operator.node.startPosition.row > operator.left.endPosition.row &&
          (isWithinConditionalCondition(operator.node.parent ?? operator.node) ||
            isIndentedExpressionBody(operator.node.parent ?? operator.node) ||
            isBlockCombinatorEntry(operator.node.parent ?? operator.node) ||
            isOrdinaryBlockResult(operator.node.parent ?? operator.node) ||
            isNestedDefinitionBody(operator.node.parent ?? operator.node));
        const preservesRightOperandBreak =
          operator.inlineComments.length === 0 &&
          operator.rightComments.length === 0 &&
          operator.right.startPosition.row > operator.node.endPosition.row &&
          (isIndentedExpressionBody(operator.node.parent ?? operator.node) ||
            isBlockCombinatorEntry(operator.node.parent ?? operator.node) ||
            isOrdinaryBlockResult(operator.node.parent ?? operator.node) ||
            isNestedDefinitionBody(operator.node.parent ?? operator.node));
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
          const expectedColumn = expressionLine.search(/\S|$/) + 4;
          if (operator.node.startPosition.column !== expectedColumn) {
            const row = operator.node.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: 1,
              length: Math.max(1, operator.node.startPosition.column),
              rule: "format/binary-operator-indentation",
              message: "expected a four-space continuation indent",
              sourceLine: lines[row] ?? "",
            });
          }
        }
        if (preservesRightOperandBreak) {
          const expressionLine = lines[operator.left.startPosition.row] ?? "";
          const expectedColumn =
            expressionLine.search(/\S|$/) + (preservesLeadingOperatorBreak ? 8 : 4);
          if (operator.right.startPosition.column !== expectedColumn) {
            const row = operator.right.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: 1,
              length: Math.max(1, operator.right.startPosition.column),
              rule: "format/binary-operator-indentation",
              message: preservesLeadingOperatorBreak
                ? "expected the right operand four spaces beyond the continued operator"
                : "expected a four-space continuation indent",
              sourceLine: lines[row] ?? "",
            });
          }
        }
      }

      for (const unitLiteral of declaration.unitLiterals ?? []) {
        const openParen = unitLiteral.children.find((child) => child.type === "(");
        const closeParen = unitLiteral.children.find((child) => child.type === ")");
        if (!openParen || !closeParen) {
          throw new Error("Unable to locate the unit literal delimiters");
        }
        const insideParentheses = source.slice(openParen.endIndex, closeParen.startIndex);
        if (insideParentheses !== "") {
          const row = openParen.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: openParen.endPosition.column + 1,
            length: Math.max(1, insideParentheses.length),
            rule: "format/expression-delimiter-spacing",
            message: "expected no space inside '()'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      for (const sequenceLiteral of declaration.sequenceLiterals ?? []) {
        const isList = sequenceLiteral.type === "list_literal";
        const kind = isList ? "list" : "tuple";
        const openType = isList ? "[" : "(";
        const closeType = isList ? "]" : ")";
        const openDelimiter = sequenceLiteral.children.find((child) => child.type === openType);
        const closeDelimiter = sequenceLiteral.children.find((child) => child.type === closeType);
        const elements = sequenceLiteral.childrenForFieldName("element");
        const commas = sequenceLiteral.children.filter((child) => child.type === ",");
        if (!openDelimiter || !closeDelimiter) {
          throw new Error(`Unable to locate the ${kind} literal delimiters`);
        }

        const firstElement = elements[0];
        const lastElement = elements.at(-1);
        if (firstElement && lastElement) {
          const afterOpenDelimiter = source.slice(openDelimiter.endIndex, firstElement.startIndex);
          const expectedOpenGap = isList ? " " : "";
          if (afterOpenDelimiter !== expectedOpenGap) {
            const row = openDelimiter.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openDelimiter.endPosition.column + 1,
              length: Math.max(1, afterOpenDelimiter.length),
              rule: "format/expression-delimiter-spacing",
              message: isList
                ? "expected one space after '['"
                : `expected no space after '${openType}'`,
              sourceLine: lines[row] ?? "",
            });
          }

          for (const [index, comma] of commas.entries()) {
            const previousElement = elements[index];
            const nextElement = elements[index + 1];
            if (!previousElement || !nextElement) {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/unnecessary-trailing-comma",
                message: `trailing commas are omitted from inline ${kind}s`,
                sourceLine: lines[row] ?? "",
              });
              continue;
            }
            const beforeComma = source.slice(previousElement.endIndex, comma.startIndex);
            const afterComma = source.slice(comma.endIndex, nextElement.startIndex);
            if (beforeComma !== "" || afterComma !== " ") {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/expression-separator-spacing",
                message: `expected ', ' between ${kind} elements`,
                sourceLine: lines[row] ?? "",
              });
            }
          }

          const beforeCloseDelimiter = source.slice(
            lastElement.endIndex,
            closeDelimiter.startIndex,
          );
          const trailingComma = commas.find((comma) => comma.startIndex >= lastElement.endIndex);
          const closeAnchor = trailingComma ?? lastElement;
          const closeGap = source.slice(closeAnchor.endIndex, closeDelimiter.startIndex);
          const expectedCloseGap = isList ? " " : "";
          if (
            (!trailingComma && beforeCloseDelimiter !== expectedCloseGap) ||
            (trailingComma && closeGap !== expectedCloseGap)
          ) {
            const row = closeDelimiter.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: closeAnchor.endPosition.column + 1,
              length: Math.max(1, closeGap.length),
              rule: "format/expression-delimiter-spacing",
              message: isList
                ? "expected one space before ']'"
                : `expected no space before '${closeType}'`,
              sourceLine: lines[row] ?? "",
            });
          }
        } else {
          const insideDelimiters = source.slice(openDelimiter.endIndex, closeDelimiter.startIndex);
          if (insideDelimiters !== "") {
            const row = openDelimiter.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openDelimiter.endPosition.column + 1,
              length: Math.max(1, insideDelimiters.length),
              rule: "format/expression-delimiter-spacing",
              message: `expected no space inside '${openType}${closeType}'`,
              sourceLine: lines[row] ?? "",
            });
          }
        }
      }

      for (const callExpression of declaration.callExpressions ?? []) {
        const functionNode = callExpression.childForFieldName("function");
        const openParen = callExpression.children.find((child) => child.type === "(");
        const closeParen = callExpression.children.find((child) => child.type === ")");
        const arguments_ = callExpression.childrenForFieldName("argument");
        const commas = callExpression.children.filter((child) => child.type === ",");
        const isMultilineLambdaCall =
          arguments_.length === 1 &&
          isMultilineLambdaExpression(arguments_[0] as Parser.SyntaxNode);
        if (!functionNode || !openParen || !closeParen) {
          throw new Error("Unable to locate the call delimiters");
        }
        if (
          callExpression.namedChildren.some(
            (child) => child.type === "comment" || child.type === "documentation_comment",
          )
        ) {
          continue;
        }
        const first = arguments_[0];
        const last = arguments_.at(-1);
        if (first && last) {
          const penultimate = arguments_.at(-2);
          const isHangingMultilineLambdaCall =
            arguments_.length > 1 &&
            isMultilineLambdaExpression(last) &&
            Boolean(penultimate && last.startPosition.row > penultimate.endPosition.row) &&
            arguments_.slice(0, -1).every((argument, index) => {
              const previous = index === 0 ? openParen : arguments_[index - 1];
              return argument.startPosition.row === previous.endPosition.row;
            }) &&
            closeParen.startPosition.row > last.endPosition.row;
          const functionDot =
            functionNode.type === "field_access_expression"
              ? functionNode.children.find((child) => child.type === ".")
              : undefined;
          const callIndentation =
            functionDot?.startPosition.column ?? callExpression.startPosition.column;
          const isMultilineUfcsCall = Boolean(
            functionDot && isMultilineUfcsContinuation(functionNode),
          );
          const hangingArgumentGap = `\n${" ".repeat(callIndentation + 2)}`;
          const hangingCloseGap = `\n${" ".repeat(callIndentation)}`;
          const expressionLineIndentation = (lines[callExpression.startPosition.row] ?? "").search(
            /\S|$/,
          );
          const expandedArgumentColumn = expressionLineIndentation + 4;
          const isVerticallyExpandedCall =
            first.startPosition.row > openParen.endPosition.row &&
            closeParen.startPosition.row > last.endPosition.row;
          const hasSourceArgumentBreak = arguments_.some((argument, index) => {
            const previous = index === 0 ? openParen : arguments_[index - 1];
            return argument.startPosition.row > previous.endPosition.row;
          });
          const isPartiallyExpandedCallWithClosingBreak =
            first.startPosition.row === openParen.endPosition.row &&
            hasSourceArgumentBreak &&
            closeParen.startPosition.row > last.endPosition.row;
          const expandedArgumentGap = `\n${" ".repeat(expandedArgumentColumn)}`;
          const expandedCloseGap = `\n${" ".repeat(expressionLineIndentation)}`;
          const requiresTrailingComma =
            functionNode.type !== "field_access_expression" &&
            closeParen.startPosition.row > last.endPosition.row;
          const afterOpen = source.slice(openParen.endIndex, first.startIndex);
          if (afterOpen !== (isVerticallyExpandedCall ? expandedArgumentGap : "")) {
            const row = openParen.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openParen.endPosition.column + 1,
              length: Math.max(1, afterOpen.length),
              rule: "format/call-delimiter-spacing",
              message: "expected no space after '('",
              sourceLine: lines[row] ?? "",
            });
          }
          for (const [index, comma] of commas.entries()) {
            const previous = arguments_[index];
            const next = arguments_[index + 1];
            if (!previous || !next) {
              if (requiresTrailingComma) continue;
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/unnecessary-trailing-comma",
                message: "trailing commas are omitted from inline calls",
                sourceLine: lines[row] ?? "",
              });
              continue;
            }
            const nextStartsOnNewLine = next.startPosition.row > previous.endPosition.row;
            const expectedNextGap =
              isHangingMultilineLambdaCall && next.id === last.id
                ? hangingArgumentGap
                : (isVerticallyExpandedCall || isPartiallyExpandedCallWithClosingBreak) &&
                    nextStartsOnNewLine
                  ? expandedArgumentGap
                  : " ";
            if (
              source.slice(previous.endIndex, comma.startIndex) !== "" ||
              source.slice(comma.endIndex, next.startIndex) !== expectedNextGap
            ) {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/argument-separator-spacing",
                message:
                  expectedNextGap === " "
                    ? "expected ', ' between arguments"
                    : "expected a line break and continuation indentation after ','",
                sourceLine: lines[row] ?? "",
              });
            }
          }
          const trailingComma = commas.find((comma) => comma.startIndex >= last.endIndex);
          if (requiresTrailingComma && !trailingComma) {
            const row = last.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: last.endPosition.column + 1,
              length: 1,
              rule: "format/missing-trailing-comma",
              message: "expected a trailing comma in a multiline call",
              sourceLine: lines[row] ?? "",
            });
          }
          const anchor = trailingComma ?? last;
          const beforeClose = source.slice(anchor.endIndex, closeParen.startIndex);
          const hasCanonicalClose = isVerticallyExpandedCall
            ? beforeClose === expandedCloseGap
            : isPartiallyExpandedCallWithClosingBreak
              ? beforeClose === expandedCloseGap
              : isHangingMultilineLambdaCall
                ? beforeClose === hangingCloseGap
                : isMultilineLambdaCall
                  ? isMultilineUfcsCall
                    ? beforeClose === hangingCloseGap
                    : /^(?:\r\n|\r|\n)[\t ]*$/.test(beforeClose)
                  : beforeClose === "";
          if (!hasCanonicalClose) {
            const row = closeParen.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: anchor.endPosition.column + 1,
              length: Math.max(1, beforeClose.length),
              rule: "format/call-delimiter-spacing",
              message: "expected no space before ')'",
              sourceLine: lines[row] ?? "",
            });
          }
          if (isVerticallyExpandedCall || isPartiallyExpandedCallWithClosingBreak) {
            for (const [index, argument] of arguments_.entries()) {
              const previous = index === 0 ? openParen : arguments_[index - 1];
              if (
                previous &&
                argument.startPosition.row > previous.endPosition.row &&
                argument.startPosition.column !== expandedArgumentColumn
              ) {
                const row = argument.startPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: 1,
                  length: Math.max(1, argument.startPosition.column),
                  rule: "format/call-argument-indentation",
                  message: "expected a four-space continuation indent",
                  sourceLine: lines[row] ?? "",
                });
              }
            }
          }
        } else {
          const inside = source.slice(openParen.endIndex, closeParen.startIndex);
          if (inside !== "") {
            const row = openParen.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openParen.endPosition.column + 1,
              length: Math.max(1, inside.length),
              rule: "format/call-delimiter-spacing",
              message: "expected no space inside '()'",
              sourceLine: lines[row] ?? "",
            });
          }
        }
      }

      if (declaration.valueNode) {
        for (const indexExpression of collectNodes(declaration.valueNode, "index_expression")) {
          const openBracket = indexExpression.children.find((child) => child.type === "[");
          const closeBracket = indexExpression.children.find((child) => child.type === "]");
          const index = indexExpression.childForFieldName("index");
          if (!openBracket || !closeBracket || !index) {
            throw new Error("Unable to locate the index expression delimiters");
          }
          const afterOpen = source.slice(openBracket.endIndex, index.startIndex);
          if (afterOpen !== "") {
            const row = openBracket.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openBracket.endPosition.column + 1,
              length: Math.max(1, afterOpen.length),
              rule: "format/index-delimiter-spacing",
              message: "expected no space after '['",
              sourceLine: lines[row] ?? "",
            });
          }
          const beforeClose = source.slice(index.endIndex, closeBracket.startIndex);
          if (beforeClose !== "") {
            const row = closeBracket.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: index.endPosition.column + 1,
              length: Math.max(1, beforeClose.length),
              rule: "format/index-delimiter-spacing",
              message: "expected no space before ']'",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        for (const fieldAccess of collectNodes(declaration.valueNode, "field_access_expression")) {
          const object = fieldAccess.childForFieldName("object");
          const field = fieldAccess.childForFieldName("field");
          const dot = fieldAccess.children.find((child) => child.type === ".");
          if (!object || !field || !dot) {
            throw new Error("Unable to locate the field access operator");
          }
          const beforeDot = source.slice(object.endIndex, dot.startIndex);
          const afterDot = source.slice(dot.endIndex, field.startIndex);
          const isMultilineContinuation = isMultilineUfcsContinuation(fieldAccess);
          const hasCanonicalBeforeDot = isMultilineContinuation
            ? /^(?:\r\n|\r|\n)[\t ]*$/.test(beforeDot)
            : beforeDot === "";
          const comments = fieldAccess.namedChildren.filter(
            (child) => child.type === "comment" || child.type === "documentation_comment",
          );
          const hasComments = comments.length > 0;
          if ((!hasComments && !hasCanonicalBeforeDot) || afterDot !== "") {
            const row = dot.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: dot.startPosition.column + 1,
              length: 1,
              rule: "format/field-access-spacing",
              message: "expected no space around '.'",
              sourceLine: lines[row] ?? "",
            });
          }
          if (
            isMultilineContinuation &&
            !hasComments &&
            dot.startPosition.column !==
              (lines[ufcsChainRoot(fieldAccess).startPosition.row]?.search(/\S|$/) ?? 0) +
                ufcsContinuationIndentation() * 2
          ) {
            const row = dot.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: 1,
              length: Math.max(1, dot.startPosition.column),
              rule: "format/field-access-indentation",
              message: "expected a four-space continuation indent",
              sourceLine: lines[row] ?? "",
            });
          }
          if (hasComments && dot.startPosition.row > object.endPosition.row) {
            const expectedColumn =
              (lines[ufcsChainRoot(fieldAccess).startPosition.row]?.search(/\S|$/) ?? 0) +
              ufcsContinuationIndentation() * 2;
            for (const continuation of [...comments, dot]) {
              if (continuation.startPosition.column === expectedColumn) continue;
              const row = continuation.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: 1,
                length: Math.max(1, continuation.startPosition.column),
                rule: "format/field-access-indentation",
                message: "expected the chain comment and selector at a four-space continuation",
                sourceLine: lines[row] ?? "",
              });
            }
          }
        }

        for (const unaryExpression of collectNodes(declaration.valueNode, "unary_expression")) {
          const operator = unaryExpression.childForFieldName("operator");
          const operand = unaryExpression.childForFieldName("operand");
          if (!operator || !operand) {
            throw new Error("Unable to locate the unary expression operands");
          }
          const gap = source.slice(operator.endIndex, operand.startIndex);
          if (gap !== "") {
            const row = operator.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: operator.endPosition.column + 1,
              length: Math.max(1, gap.length),
              rule: "format/unary-operator-spacing",
              message: `expected no space after '${operator.text}'`,
              sourceLine: lines[row] ?? "",
            });
          }
        }

        for (const lambda of collectNodes(declaration.valueNode, "lambda_expression")) {
          const parameters = lambda.childrenForFieldName("parameter");
          const body = lambda.childForFieldName("body");
          const arrow = lambda.children.find((child) => child.type === "=>");
          const openParen = lambda.children.find((child) => child.type === "(");
          const closeParen = lambda.children.find((child) => child.type === ")");
          const first = parameters[0];
          const last = parameters.at(-1);
          if (!body || !arrow || !first || !last) {
            throw new Error("Unable to locate the lambda syntax");
          }
          if (openParen && closeParen) {
            const afterOpen = source.slice(openParen.endIndex, first.startIndex);
            if (afterOpen !== "") {
              const row = openParen.endPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: openParen.endPosition.column + 1,
                length: Math.max(1, afterOpen.length),
                rule: "format/lambda-parameter-list-spacing",
                message: "expected no space after '('",
                sourceLine: lines[row] ?? "",
              });
            }
            const commas = lambda.children.filter((child) => child.type === ",");
            for (const [index, comma] of commas.entries()) {
              const previous = parameters[index];
              const next = parameters[index + 1];
              if (
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
                  rule: "format/lambda-parameter-separator-spacing",
                  message: "expected ', ' between parameters",
                  sourceLine: lines[row] ?? "",
                });
              }
            }
            const beforeClose = source.slice(last.endIndex, closeParen.startIndex);
            if (beforeClose !== "") {
              const row = closeParen.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: last.endPosition.column + 1,
                length: Math.max(1, beforeClose.length),
                rule: "format/lambda-parameter-list-spacing",
                message: "expected no space before ')'",
                sourceLine: lines[row] ?? "",
              });
            }
          }
          const arrowAnchor = closeParen ?? last;
          const afterArrow = source.slice(arrow.endIndex, body.startIndex);
          const hasCanonicalBodySeparation = isMultilineLambdaExpression(lambda)
            ? /^(?:\r\n|\r|\n)[\t ]*$/.test(afterArrow)
            : afterArrow === " ";
          if (
            source.slice(arrowAnchor.endIndex, arrow.startIndex) !== " " ||
            !hasCanonicalBodySeparation
          ) {
            const row = arrow.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: arrow.startPosition.column + 1,
              length: 2,
              rule: "format/lambda-arrow-spacing",
              message: "expected one space around '=>'",
              sourceLine: lines[row] ?? "",
            });
          }
          const parentCall = lambda.parent?.type === "call_expression" ? lambda.parent : undefined;
          const parentFunction = parentCall?.childForFieldName("function");
          const functionObject = parentFunction?.childForFieldName("object");
          const functionDot = parentFunction?.children.find((child) => child.type === ".");
          const isMultilineUfcsLambda = Boolean(
            parentFunction?.type === "field_access_expression" &&
              functionObject &&
              functionDot &&
              functionDot.startPosition.row > functionObject.endPosition.row &&
              body.startPosition.row > arrow.endPosition.row,
          );
          if (
            isMultilineUfcsLambda &&
            functionDot &&
            body.startPosition.column !== functionDot.startPosition.column + 2
          ) {
            const row = body.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: 1,
              length: Math.max(1, body.startPosition.column),
              rule: "format/lambda-body-indentation",
              message: "expected the lambda body two spaces inside the UFCS call",
              sourceLine: lines[row] ?? "",
            });
          }
          for (const parameter of parameters) {
            checkPatternSpacing(parameter, source, lines, filePath, diagnostics);
          }
        }

        for (const conditional of collectNodes(declaration.valueNode, "if_expression")) {
          const keyword = conditional.children.find((child) => child.type === "if");
          const openParen = conditional.children.find((child) => child.type === "(");
          const closeParen = conditional.children.find((child) => child.type === ")");
          const elseKeyword = conditional.children.find((child) => child.type === "else");
          const condition = conditional.childForFieldName("condition");
          const consequence = conditional.childForFieldName("consequence");
          const alternative = conditional.childForFieldName("alternative");
          if (
            !keyword ||
            !openParen ||
            !closeParen ||
            !elseKeyword ||
            !condition ||
            !consequence ||
            !alternative
          ) {
            throw new Error("Unable to locate the conditional syntax");
          }
          if (source.slice(keyword.endIndex, openParen.startIndex) !== " ") {
            const row = openParen.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openParen.startPosition.column + 1,
              length: 1,
              rule: "format/conditional-keyword-spacing",
              message: "expected one space after 'if'",
              sourceLine: lines[row] ?? "",
            });
          }
          const afterOpen = source.slice(openParen.endIndex, condition.startIndex);
          if (afterOpen !== "") {
            const row = openParen.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openParen.endPosition.column + 1,
              length: Math.max(1, afterOpen.length),
              rule: "format/conditional-delimiter-spacing",
              message: "expected no space after '('",
              sourceLine: lines[row] ?? "",
            });
          }
          const beforeClose = source.slice(condition.endIndex, closeParen.startIndex);
          if (beforeClose !== "") {
            const row = closeParen.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: condition.endPosition.column + 1,
              length: Math.max(1, beforeClose.length),
              rule: "format/conditional-delimiter-spacing",
              message: "expected no space before ')'",
              sourceLine: lines[row] ?? "",
            });
          }
          const consequenceComments = conditional.namedChildren.filter(
            (child) =>
              (child.type === "comment" || child.type === "documentation_comment") &&
              child.startIndex >= condition.endIndex &&
              child.endIndex <= consequence.startIndex,
          );
          const alternativeComments = conditional.namedChildren.filter(
            (child) =>
              (child.type === "comment" || child.type === "documentation_comment") &&
              child.startIndex >= consequence.endIndex &&
              child.endIndex <= alternative.startIndex,
          );
          const trailingConsequenceComments = alternativeComments.filter(
            (comment) => comment.startPosition.row === consequence.endPosition.row,
          );
          const leadingAlternativeComments = alternativeComments.filter(
            (comment) =>
              !trailingConsequenceComments.some((trailing) => trailing.id === comment.id),
          );
          const inlineElseComment =
            leadingAlternativeComments.length === 1 &&
            leadingAlternativeComments[0]?.startPosition.row === elseKeyword.endPosition.row
              ? leadingAlternativeComments[0]
              : undefined;
          const expandsSourceMultilineCondition =
            condition.startPosition.row < condition.endPosition.row;
          const expandsConditionalChain = alternative.type === "if_expression";
          const formatsConditionalChain = expandsConditionalChain || isElseIfBranch(conditional);
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
          const expectedConsequenceGap = preservesConsequenceLineBreak
            ? `\n${" ".repeat(conditional.startPosition.column + 2)}`
            : " ";
          if (
            source.slice(closeParen.endIndex, consequence.startIndex) !== expectedConsequenceGap
          ) {
            const row = closeParen.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: closeParen.endPosition.column + 1,
              length: 1,
              rule: "format/conditional-branch-spacing",
              message: preservesConsequenceLineBreak
                ? "expected a line break and two-space indentation after ')'"
                : "expected one space after ')'",
              sourceLine: lines[row] ?? "",
            });
          }
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
          const expectedElseGap = preservesElseLineBreak
            ? `\n${" ".repeat(conditional.startPosition.column)}`
            : separatesCommentedElse
              ? `\n${" ".repeat(conditional.startPosition.column)}`
              : " ";
          const expectedAlternativeGap = preservesAlternativeLineBreak
            ? `\n${" ".repeat(conditional.startPosition.column + 2)}`
            : " ";
          const hasCanonicalAlternativeGap = inlineElseComment
            ? /^[\t ]+$/.test(source.slice(elseKeyword.endIndex, inlineElseComment.startIndex)) &&
              source.slice(inlineElseComment.endIndex, alternative.startIndex) ===
                `\n${" ".repeat(conditional.startPosition.column + 2)}`
            : source.slice(elseKeyword.endIndex, alternative.startIndex) === expectedAlternativeGap;
          let trailingConsequenceAnchor = consequence;
          for (const comment of trailingConsequenceComments) {
            const gap = source.slice(trailingConsequenceAnchor.endIndex, comment.startIndex);
            if (!/^[\t ]+$/.test(gap)) {
              const row = comment.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comment.startPosition.column + 1,
                length: 2,
                rule: "format/comment-spacing",
                message: "expected spacing before a trailing consequence comment",
                sourceLine: lines[row] ?? "",
              });
            }
            trailingConsequenceAnchor = comment;
          }
          if (
            source.slice(trailingConsequenceAnchor.endIndex, elseKeyword.startIndex) !==
              expectedElseGap ||
            !hasCanonicalAlternativeGap
          ) {
            const row = elseKeyword.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: elseKeyword.startPosition.column + 1,
              length: 4,
              rule: "format/conditional-else-spacing",
              message:
                preservesElseLineBreak || separatesCommentedElse || preservesAlternativeLineBreak
                  ? "expected preserved line breaks and indentation around 'else'"
                  : "expected one space around 'else'",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        for (const matchExpression of collectNodes(declaration.valueNode, "match_expression")) {
          const openBrace = matchExpression.children.find((child) => child.type === "{");
          const closeBrace = matchExpression.children.find((child) => child.type === "}");
          const arms = matchExpression.childrenForFieldName("arm");
          if (!openBrace || !closeBrace || arms.length === 0) {
            throw new Error("Unable to locate the match layout");
          }
          const rows = arms.map((arm) => arm.startPosition.row);
          const compactDefaultMatch = isCompactDefaultMatch(matchExpression);
          const compactArm = arms[0];
          const hasCanonicalCompactLayout = Boolean(
            compactDefaultMatch &&
              compactArm &&
              !compactArm.children.some((child) => child.type === "|") &&
              source.slice(openBrace.endIndex, compactArm.startIndex) === " " &&
              source.slice(compactArm.endIndex, closeBrace.startIndex) === " ",
          );
          const hasCanonicalLines =
            hasCanonicalCompactLayout ||
            (rows[0] !== openBrace.startPosition.row &&
              rows.every((row, index) => index === 0 || row > (rows[index - 1] as number)) &&
              closeBrace.startPosition.row > (rows.at(-1) as number));
          if (!hasCanonicalLines) {
            const row = openBrace.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openBrace.startPosition.column + 1,
              length: 1,
              rule: "format/match-layout",
              message: compactDefaultMatch
                ? "expected one space inside the compact default match braces"
                : "expected match arms and the closing brace on separate lines",
              sourceLine: lines[row] ?? "",
            });
          }
          for (const arm of arms) {
            const variant = arm.childForFieldName("variant");
            const parameter = arm.childForFieldName("parameter");
            const body = arm.childForFieldName("body");
            const arrow = arm.children.find((child) => child.type === "=>");
            if (!variant || !body || !arrow) throw new Error("Unable to locate a match arm");
            let patternEnd = variant;
            if (parameter) {
              const openParen = arm.children.find((child) => child.type === "(");
              const closeParen = arm.children.find((child) => child.type === ")");
              if (!openParen || !closeParen)
                throw new Error("Unable to locate the match payload pattern");
              const afterOpen = source.slice(openParen.endIndex, parameter.startIndex);
              if (afterOpen !== "") {
                const row = openParen.endPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: openParen.endPosition.column + 1,
                  length: Math.max(1, afterOpen.length),
                  rule: "format/match-pattern-spacing",
                  message: "expected no space after '('",
                  sourceLine: lines[row] ?? "",
                });
              }
              const beforeClose = source.slice(parameter.endIndex, closeParen.startIndex);
              if (beforeClose !== "") {
                const row = closeParen.startPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: parameter.endPosition.column + 1,
                  length: Math.max(1, beforeClose.length),
                  rule: "format/match-pattern-spacing",
                  message: "expected no space before ')'",
                  sourceLine: lines[row] ?? "",
                });
              }
              patternEnd = closeParen;
            }
            const preBodyComments = arm.namedChildren.filter(
              (child) =>
                (child.type === "comment" || child.type === "documentation_comment") &&
                child.endIndex <= body.startIndex,
            );
            const inlineArrowComment = preBodyComments.find(
              (comment) => comment.startPosition.row === arrow.endPosition.row,
            );
            const afterArrow = source.slice(
              arrow.endIndex,
              inlineArrowComment?.startIndex ?? body.startIndex,
            );
            const afterInlineArrowComment = inlineArrowComment
              ? source.slice(inlineArrowComment.endIndex, body.startIndex)
              : "";
            const hasCanonicalBodySeparation = inlineArrowComment
              ? /^[\t ]+$/.test(afterArrow) &&
                /^(?:\r\n|\r|\n)[\t ]*$/.test(afterInlineArrowComment)
              : afterArrow === " " || /^(?:\r\n|\r|\n)[\t ]*$/.test(afterArrow);
            if (
              !/^ +$/u.test(source.slice(patternEnd.endIndex, arrow.startIndex)) ||
              !hasCanonicalBodySeparation
            ) {
              const row = arrow.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: arrow.startPosition.column + 1,
                length: 2,
                rule: "format/match-arrow-spacing",
                message: "expected one space around '=>'",
                sourceLine: lines[row] ?? "",
              });
            }

            const combinatorField =
              body.type === "any_expression"
                ? "choice"
                : body.type === "or_block_expression"
                  ? "disjunct"
                  : body.type === "all_expression" || body.type === "and_block_expression"
                    ? "conjunct"
                    : undefined;
            if (combinatorField) {
              const entries = body.childrenForFieldName(combinatorField);
              const closeBrace = body.children.find((child) => child.type === "}");
              const expectedEntryColumn = arm.startPosition.column + 4;
              const expectedCloseColumn = arm.startPosition.column + 2;
              const misindentedNode =
                entries.find((entry) => entry.startPosition.column !== expectedEntryColumn) ??
                (closeBrace?.startPosition.column !== expectedCloseColumn ? closeBrace : undefined);
              if (misindentedNode) {
                const row = misindentedNode.startPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: 1,
                  length: Math.max(1, misindentedNode.startPosition.column),
                  rule: "format/match-arm-body-indentation",
                  message: "expected the nested match-arm body to be indented one level",
                  sourceLine: lines[row] ?? "",
                });
              }
            }
          }
        }

        const namespaceNodes = [
          ...collectNodes(declaration.valueNode, "qualified_identifier"),
          ...collectNodes(declaration.valueNode, "namespace_access_expression"),
        ];
        for (const namespaceNode of namespaceNodes) {
          const names = namespaceNode.namedChildren;
          const separators = namespaceNode.children.filter((child) => child.type === "::");
          for (const [index, separator] of separators.entries()) {
            const previous = names[index];
            const next = names[index + 1];
            if (!previous || !next) throw new Error("Unable to locate names around '::'");
            if (
              source.slice(previous.endIndex, separator.startIndex) !== "" ||
              source.slice(separator.endIndex, next.startIndex) !== ""
            ) {
              const row = separator.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: separator.startPosition.column + 1,
                length: 2,
                rule: "format/namespace-access-spacing",
                message: "expected no space around '::'",
                sourceLine: lines[row] ?? "",
              });
            }
          }
        }

        for (const assignment of collectNodes(declaration.valueNode, "assignment_expression")) {
          const target = assignment.childForFieldName("target");
          const value = assignment.childForFieldName("value");
          const name = target?.childForFieldName("name");
          const prime = target?.children.find((child) => child.type === "'");
          const equals = assignment.children.find((child) => child.type === "=");
          if (!target || !value || !name || !prime || !equals) {
            throw new Error("Unable to locate the primed assignment syntax");
          }
          const primeGap = source.slice(name.endIndex, prime.startIndex);
          if (primeGap !== "") {
            const row = name.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: name.endPosition.column + 1,
              length: Math.max(1, primeGap.length),
              rule: "format/prime-spacing",
              message: 'expected no space before "\'"',
              sourceLine: lines[row] ?? "",
            });
          }
          const preservesLineBreak = value.startPosition.row > equals.endPosition.row;
          const expectedValueGap = preservesLineBreak
            ? `\n${" ".repeat(assignment.startPosition.column + 2)}`
            : " ";
          if (
            source.slice(target.endIndex, equals.startIndex) !== " " ||
            source.slice(equals.endIndex, value.startIndex) !== expectedValueGap
          ) {
            const row = equals.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: equals.startPosition.column + 1,
              length: 1,
              rule: "format/assignment-spacing",
              message: preservesLineBreak
                ? "expected a line break and two-space indentation after '='"
                : "expected one space around '='",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        for (const block of collectNodes(declaration.valueNode, "block_expression")) {
          const openBrace = block.children.find((child) => child.type === "{");
          const closeBrace = block.children.find((child) => child.type === "}");
          const expression = block.childForFieldName("expression");
          const bindings = block.childrenForFieldName("binding");
          const firstContent = bindings[0] ?? expression;
          if (!openBrace || !closeBrace || !expression || !firstContent) {
            throw new Error("Unable to locate the block layout");
          }
          const contentNodes = [...bindings, expression];
          const rows = contentNodes.map((content) => content.startPosition.row);
          const nested = block.parent;
          const nestedDefinition =
            nested?.type === "nested_definition_expression"
              ? nested.childForFieldName("definition")
              : null;
          const isCompactNestedBlock = Boolean(
            nestedDefinition && compactNestedBlockExpression(nestedDefinition, block),
          );
          const parentLambda = block.parent?.type === "lambda_expression" ? block.parent : null;
          const isCompactLambdaBlock = Boolean(
            parentLambda && compactLambdaBlockExpression(parentLambda, block),
          );
          const hasCanonicalLines =
            isCompactNestedBlock ||
            isCompactLambdaBlock ||
            (rows[0] !== openBrace.startPosition.row &&
              rows.every((row, index) => index === 0 || row > (rows[index - 1] as number)) &&
              closeBrace.startPosition.row > (rows.at(-1) as number));
          if (!hasCanonicalLines) {
            const row = openBrace.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openBrace.startPosition.column + 1,
              length: 1,
              rule: "format/block-layout",
              message: "expected block contents and the closing brace on separate lines",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        for (const binding of collectNodes(declaration.valueNode, "nondet_binding")) {
          const keyword = binding.children.find((child) => child.type === "nondet");
          const name = binding.childForFieldName("name");
          const equals = binding.children.find((child) => child.type === "=");
          const value = binding.childForFieldName("value");
          if (!keyword || !name || !equals || !value) {
            throw new Error("Unable to locate the nondet binding syntax");
          }
          const afterKeyword = source.slice(keyword.endIndex, name.startIndex);
          if (afterKeyword !== " ") {
            const row = keyword.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: keyword.endPosition.column + 1,
              length: Math.max(1, afterKeyword.length),
              rule: "format/nondet-binding-spacing",
              message: "expected one space after 'nondet'",
              sourceLine: lines[row] ?? "",
            });
          }
          if (
            source.slice(name.endIndex, equals.startIndex) !== " " ||
            source.slice(equals.endIndex, value.startIndex) !== " "
          ) {
            const row = equals.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: equals.startPosition.column + 1,
              length: 1,
              rule: "format/nondet-binding-spacing",
              message: "expected one space around '='",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        for (const nested of collectNodes(declaration.valueNode, "nested_definition_expression")) {
          const definition = nested.childForFieldName("definition");
          const body = nested.childForFieldName("body");
          if (!definition || !body)
            throw new Error("Unable to locate the nested definition layout");
          checkLocalDefinition(definition, source, lines, filePath, diagnostics);
          const preservesCompactNondetSequence = isCompactNondetSequence(definition, body);
          const hasCanonicalCompactGap =
            preservesCompactNondetSequence &&
            source.slice(definition.endIndex, body.startIndex) === " ";
          if (preservesCompactNondetSequence && !hasCanonicalCompactGap) {
            const row = body.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: body.startPosition.column + 1,
              length: Math.max(1, body.text.length),
              rule: "format/nested-definition-layout",
              message: "expected one space after the compact nondet definition",
              sourceLine: lines[row] ?? "",
            });
          } else if (
            body.startPosition.row <= definition.endPosition.row &&
            !compactNestedBlockExpression(definition, body) &&
            !preservesCompactNondetSequence
          ) {
            const row = body.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: body.startPosition.column + 1,
              length: Math.max(1, body.text.length),
              rule: "format/nested-definition-layout",
              message: "expected the nested definition body on a new line",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        const combinatorTypes = [
          ["any_expression", "choice"],
          ["all_expression", "conjunct"],
          ["and_block_expression", "conjunct"],
          ["or_block_expression", "disjunct"],
        ] as const;
        for (const [type, fieldName] of combinatorTypes) {
          for (const combinator of collectNodes(declaration.valueNode, type)) {
            const openBrace = combinator.children.find((child) => child.type === "{");
            const closeBrace = combinator.children.find((child) => child.type === "}");
            const entries = combinator.childrenForFieldName(fieldName);
            const commas = combinator.children.filter((child) => child.type === ",");
            if (!openBrace || !closeBrace || entries.length === 0) {
              throw new Error("Unable to locate the block combinator layout");
            }
            const rows = entries.map((entry) => entry.startPosition.row);
            const comments = combinator.namedChildren.filter(
              (child) => child.type === "comment" || child.type === "documentation_comment",
            );
            const hasCompactLayout =
              openBrace.startPosition.row === closeBrace.startPosition.row &&
              rows.every((row) => row === openBrace.startPosition.row);
            const preservesCompactLayout =
              hasCompactLayout &&
              comments.length === 0 &&
              (lines[openBrace.startPosition.row]?.length ?? 0) <= 120;
            const hasCanonicalLines =
              preservesCompactLayout ||
              (rows[0] !== openBrace.startPosition.row &&
                rows.every((row, index) => index === 0 || row >= (rows[index - 1] as number)) &&
                closeBrace.startPosition.row > (rows.at(-1) as number));
            if (!hasCanonicalLines) {
              const row = openBrace.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: openBrace.startPosition.column + 1,
                length: 1,
                rule: "format/block-combinator-layout",
                message: "expected choices and the closing brace on separate lines",
                sourceLine: lines[row] ?? "",
              });
            }
            if (preservesCompactLayout) {
              const firstEntry = entries[0] as Parser.SyntaxNode;
              const lastEntry = entries.at(-1) as Parser.SyntaxNode;
              if (
                source.slice(openBrace.endIndex, firstEntry.startIndex) !== " " ||
                source.slice(lastEntry.endIndex, closeBrace.startIndex) !== " "
              ) {
                const row = openBrace.startPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: openBrace.endPosition.column + 1,
                  length: 1,
                  rule: "format/block-combinator-brace-spacing",
                  message: "expected one space inside compact block-combinator braces",
                  sourceLine: lines[row] ?? "",
                });
              }
            }
            const openingComment = combinator.namedChildren.find(
              (child) =>
                (child.type === "comment" || child.type === "documentation_comment") &&
                child.startPosition.row === openBrace.endPosition.row,
            );
            const firstContent = combinator.namedChildren.find(
              (child) => child.id !== openingComment?.id,
            );
            const openingAnchor = openingComment ?? openBrace;
            if (
              !preservesCompactLayout &&
              firstContent &&
              firstContent.startPosition.row > openingAnchor.endPosition.row + 1
            ) {
              const row = openingAnchor.endPosition.row + 1;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: 1,
                length: 1,
                rule: "format/block-combinator-opening-gap",
                message: "expected block contents directly after the opening brace",
                sourceLine: lines[row] ?? "",
              });
            }
            if (
              openingComment &&
              source.slice(openBrace.endIndex, openingComment.startIndex) !== " "
            ) {
              const row = openingComment.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: openBrace.endPosition.column + 1,
                length: Math.max(1, openingComment.startIndex - openBrace.endIndex),
                rule: "format/block-combinator-opening-comment-spacing",
                message: "expected one space before the block-opening comment",
                sourceLine: lines[row] ?? "",
              });
            }
            for (const [index, entry] of entries.entries()) {
              const comma = commas[index];
              if (preservesCompactLayout && index === entries.length - 1) {
                if (comma) {
                  const row = comma.startPosition.row;
                  diagnostics.push({
                    filePath,
                    line: row + 1,
                    column: comma.startPosition.column + 1,
                    length: 1,
                    rule: "format/block-combinator-separator-spacing",
                    message: "expected no trailing comma in a compact block combinator",
                    sourceLine: lines[row] ?? "",
                  });
                }
                continue;
              }
              if (!comma) {
                const row = entry.endPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: entry.endPosition.column + 1,
                  length: 1,
                  rule: "format/block-combinator-separator-spacing",
                  message: "expected a trailing comma after each block entry",
                  sourceLine: lines[row] ?? "",
                });
                continue;
              }
              const previous = entries[index];
              if (previous && source.slice(previous.endIndex, comma.startIndex) !== "") {
                const row = comma.startPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: comma.startPosition.column + 1,
                  length: 1,
                  rule: "format/block-combinator-separator-spacing",
                  message: "expected no space before ','",
                  sourceLine: lines[row] ?? "",
                });
              }
              const next = entries[index + 1];
              if (
                next &&
                next.startPosition.row === comma.endPosition.row &&
                source.slice(comma.endIndex, next.startIndex) !== " "
              ) {
                const row = comma.startPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: comma.endPosition.column + 1,
                  length: Math.max(1, next.startIndex - comma.endIndex),
                  rule: "format/block-combinator-separator-spacing",
                  message: "expected one space after ',' between grouped block entries",
                  sourceLine: lines[row] ?? "",
                });
              }
            }
          }
        }
      }

      for (const recordLiteral of declaration.recordLiterals ?? []) {
        const openBrace = recordLiteral.children.find((child) => child.type === "{");
        const closeBrace = recordLiteral.children.find((child) => child.type === "}");
        const fields = recordLiteral.namedChildren.filter(
          (child) => child.type === "record_literal_field",
        );
        const spreads = recordLiteral.namedChildren.filter(
          (child) => child.type === "record_spread",
        );
        const comments = recordLiteral.namedChildren.filter(
          (child) => child.type === "comment" || child.type === "documentation_comment",
        );
        const elements = [...fields, ...spreads].sort(
          (left, right) => left.startIndex - right.startIndex,
        );
        const children = recordLiteral.namedChildren;
        const commas = recordLiteral.children.filter((child) => child.type === ",");
        const firstElement = children[0];
        const lastElement = children.at(-1);
        if (!openBrace || !closeBrace || !firstElement || !lastElement) {
          throw new Error("Unable to locate the record literal delimiters");
        }

        const afterOpenBrace = source.slice(openBrace.endIndex, firstElement.startIndex);
        const isCommentedRecord = comments.length > 0;
        const isExpandedRecord =
          isCommentedRecord || recordLiteral.startPosition.row < recordLiteral.endPosition.row;
        const hasCanonicalOpening = isExpandedRecord
          ? firstElement.startPosition.row > openBrace.startPosition.row
          : afterOpenBrace === " ";
        if (!hasCanonicalOpening) {
          const row = openBrace.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: openBrace.endPosition.column + 1,
            length: Math.max(1, afterOpenBrace.length),
            rule: isExpandedRecord
              ? isCommentedRecord
                ? "format/commented-record-layout"
                : "format/multiline-record-layout"
              : "format/expression-delimiter-spacing",
            message: isExpandedRecord
              ? isCommentedRecord
                ? "expected commented record contents on separate lines"
                : "expected record contents on separate lines"
              : "expected one space after '{'",
            sourceLine: lines[row] ?? "",
          });
        }

        for (const field of fields) {
          const name = field.childForFieldName("name");
          const value = field.childForFieldName("value");
          const colon = field.children.find((child) => child.type === ":");
          if (!name || !value || !colon) {
            throw new Error("Unable to locate a record literal field");
          }
          const beforeColon = source.slice(name.endIndex, colon.startIndex);
          if (beforeColon !== "") {
            const row = name.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: name.endPosition.column + 1,
              length: Math.max(1, beforeColon.length),
              rule: "format/expression-colon-spacing",
              message: "expected no space before ':'",
              sourceLine: lines[row] ?? "",
            });
          }
          const afterColon = source.slice(colon.endIndex, value.startIndex);
          if (afterColon !== " ") {
            const row = colon.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: colon.endPosition.column + 1,
              length: Math.max(1, afterColon.length),
              rule: "format/expression-colon-spacing",
              message: "expected one space after ':'",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        for (const spread of spreads) {
          const spreadOperator = spread.children.find((child) => child.type === "...");
          const value = spread.childForFieldName("value");
          if (!spreadOperator || !value) {
            throw new Error("Unable to locate a record spread value");
          }
          const afterSpread = source.slice(spreadOperator.endIndex, value.startIndex);
          if (afterSpread !== "") {
            const row = spreadOperator.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: spreadOperator.endPosition.column + 1,
              length: Math.max(1, afterSpread.length),
              rule: "format/record-spread-spacing",
              message: "expected no space after '...'",
              sourceLine: lines[row] ?? "",
            });
          }
        }

        if (isExpandedRecord) {
          for (const [index, element] of elements.entries()) {
            const nextElement = elements[index + 1];
            const comma = commas.find(
              (candidate) =>
                candidate.startIndex >= element.endIndex &&
                candidate.startIndex < (nextElement?.startIndex ?? closeBrace.startIndex),
            );
            if (!comma || source.slice(element.endIndex, comma.startIndex) !== "") {
              const row = element.endPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: element.endPosition.column + 1,
                length: 1,
                rule: isCommentedRecord
                  ? "format/commented-record-separator"
                  : "format/multiline-record-separator",
                message: "expected a trailing comma after each record element",
                sourceLine: lines[row] ?? "",
              });
            }
            if (
              comma &&
              nextElement?.startPosition.row === comma.endPosition.row &&
              source.slice(comma.endIndex, nextElement.startIndex) !== " "
            ) {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.endPosition.column + 1,
                length: Math.max(1, nextElement.startIndex - comma.endIndex),
                rule: "format/multiline-record-separator",
                message: "expected one space between grouped record elements",
                sourceLine: lines[row] ?? "",
              });
            }
          }
          for (const comment of comments) {
            const previousElement = [...elements]
              .reverse()
              .find((element) => element.endIndex <= comment.startIndex);
            if (previousElement?.endPosition.row === comment.startPosition.row) {
              const comma = commas.find(
                (candidate) =>
                  candidate.startIndex >= previousElement.endIndex &&
                  candidate.endIndex <= comment.startIndex,
              );
              if (!comma || source.slice(comma.endIndex, comment.startIndex) !== " ") {
                const row = comment.startPosition.row;
                diagnostics.push({
                  filePath,
                  line: row + 1,
                  column: comment.startPosition.column + 1,
                  length: 2,
                  rule: "format/comment-spacing",
                  message: "expected one space before a trailing comment",
                  sourceLine: lines[row] ?? "",
                });
              }
            }
          }
        } else {
          for (const [index, comma] of commas.entries()) {
            const previousElement = elements[index];
            const nextElement = elements[index + 1];
            if (!previousElement || !nextElement) {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/unnecessary-trailing-comma",
                message: "trailing commas are omitted from inline records",
                sourceLine: lines[row] ?? "",
              });
              continue;
            }
            const beforeComma = source.slice(previousElement.endIndex, comma.startIndex);
            const afterComma = source.slice(comma.endIndex, nextElement.startIndex);
            if (beforeComma !== "" || afterComma !== " ") {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/expression-separator-spacing",
                message: `expected ', ' between record ${spreads.length > 0 ? "elements" : "fields"}`,
                sourceLine: lines[row] ?? "",
              });
            }
          }
        }

        const trailingComma = commas.find((comma) => comma.startIndex >= lastElement.endIndex);
        const closeAnchor = trailingComma ?? lastElement;
        const beforeCloseBrace = source.slice(closeAnchor.endIndex, closeBrace.startIndex);
        const hasCanonicalClosing = isExpandedRecord
          ? closeBrace.startPosition.row > closeAnchor.endPosition.row
          : beforeCloseBrace === " ";
        if (!hasCanonicalClosing) {
          const row = closeBrace.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: closeAnchor.endPosition.column + 1,
            length: Math.max(1, beforeCloseBrace.length),
            rule: isExpandedRecord
              ? isCommentedRecord
                ? "format/commented-record-layout"
                : "format/multiline-record-layout"
              : "format/expression-delimiter-spacing",
            message: isExpandedRecord
              ? "expected the closing brace on its own line"
              : "expected one space before '}'",
            sourceLine: lines[row] ?? "",
          });
        }
      }
    }
  }

  diagnostics.push(...checkTrailingSourceComments(analyzedSource, source, filePath, lines));

  diagnostics.push(...checkFinalNewline(source, filePath, lines));

  return diagnostics.sort((left, right) => left.line - right.line || left.column - right.column);
}
