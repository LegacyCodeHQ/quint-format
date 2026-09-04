import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { concat, type Doc, hardLine, indent, renderDoc, text } from "./document";

const parser = new Parser();
parser.setLanguage(Quint);

export interface FormatDiagnostic {
  filePath: string;
  line: number;
  column: number;
  length: number;
  rule: string;
  message: string;
  sourceLine: string;
}

type SourceDiagnostic = Omit<FormatDiagnostic, "filePath">;

export class QuintSyntaxError extends SyntaxError {
  readonly diagnostic: SourceDiagnostic;
  readonly diagnostics: SourceDiagnostic[];

  constructor(diagnostics: SourceDiagnostic[]) {
    const diagnostic = diagnostics[0];
    if (!diagnostic) throw new Error("A Quint syntax error requires at least one diagnostic");
    super(diagnostic.message);
    this.name = "QuintSyntaxError";
    this.diagnostic = diagnostic;
    this.diagnostics = diagnostics;
  }
}

function findSyntaxProblems(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  if (node.isMissing || (node.isError && !node.hasError)) {
    return [node];
  }

  return node.children
    .filter((child) => child.hasError || child.isError || child.isMissing)
    .flatMap(findSyntaxProblems);
}

function parseQuint(source: string): Parser.SyntaxNode {
  const root = parser.parse(source).rootNode;

  if (!root.hasError) {
    return root;
  }

  const problems = findSyntaxProblems(root);
  if (problems.length === 0) {
    throw new SyntaxError("Cannot locate the Quint syntax error");
  }

  const lines = source.split(/\r?\n/);
  throw new QuintSyntaxError(
    problems.map((problem) => {
      const isMissingAtEndOfFile =
        problem.isMissing && source.slice(problem.endIndex).trim() === "";
      const position = isMissingAtEndOfFile ? root.endPosition : problem.startPosition;
      const sourceLine = lines[position.row] ?? "";
      const length =
        problem.isMissing || problem.startPosition.row !== problem.endPosition.row
          ? 1
          : Math.max(1, problem.endPosition.column - problem.startPosition.column);
      return {
        line: position.row + 1,
        column: position.column + 1,
        length,
        rule: problem.isMissing ? "parse/missing-token" : "parse/unexpected-token",
        message: problem.isMissing ? `expected '${problem.type}'` : `unexpected '${problem.text}'`,
        sourceLine,
      };
    }),
  );
}

function positionAtIndex(source: string, index: number) {
  const lines = source.slice(0, index).split(/\r\n|\r|\n/);
  const lastLine = lines.at(-1) ?? "";
  return { row: lines.length - 1, column: Array.from(lastLine).length };
}

interface ModuleDeclaration {
  node: Parser.SyntaxNode;
  leadingComments?: Parser.SyntaxNode[];
  trailingComments?: Parser.SyntaxNode[];
  qualifier?: Parser.SyntaxNode;
  keyword: Parser.SyntaxNode;
  nameNode: Parser.SyntaxNode;
  colon?: Parser.SyntaxNode;
  typeNode?: Parser.SyntaxNode;
  typeAnchor?: Parser.SyntaxNode;
  typeRoots?: Parser.SyntaxNode[];
  openParen?: Parser.SyntaxNode;
  closeParen?: Parser.SyntaxNode;
  parameters?: Parser.SyntaxNode[];
  parameterCommas?: Parser.SyntaxNode[];
  typeOpenBracket?: Parser.SyntaxNode;
  typeCloseBracket?: Parser.SyntaxNode;
  typeParameters?: Parser.SyntaxNode[];
  typeParameterCommas?: Parser.SyntaxNode[];
  aliasNode?: Parser.SyntaxNode;
  asKeyword?: Parser.SyntaxNode;
  dot?: Parser.SyntaxNode;
  selectorNode?: Parser.SyntaxNode;
  fromKeyword?: Parser.SyntaxNode;
  sourceNode?: Parser.SyntaxNode;
  instanceOpenParen?: Parser.SyntaxNode;
  instanceCloseParen?: Parser.SyntaxNode;
  instanceOverrides?: Parser.SyntaxNode[];
  instanceCommas?: Parser.SyntaxNode[];
  semicolon?: Parser.SyntaxNode;
  equals?: Parser.SyntaxNode;
  valueNode?: Parser.SyntaxNode;
  binaryOperators?: BinaryOperator[];
  unitLiterals?: Parser.SyntaxNode[];
  sequenceLiterals?: Parser.SyntaxNode[];
  recordLiterals?: Parser.SyntaxNode[];
  callExpressions?: Parser.SyntaxNode[];
  document: Doc;
}

interface BinaryOperator {
  node: Parser.SyntaxNode;
  left: Parser.SyntaxNode;
  right: Parser.SyntaxNode;
  inlineComments: Parser.SyntaxNode[];
  rightComments: Parser.SyntaxNode[];
}

interface ExpressionAnalysis {
  document: Doc;
  binaryOperators: BinaryOperator[];
  unitLiterals: Parser.SyntaxNode[];
  sequenceLiterals: Parser.SyntaxNode[];
  recordLiterals: Parser.SyntaxNode[];
  callExpressions: Parser.SyntaxNode[];
}

function canFormatType(node: Parser.SyntaxNode): boolean {
  if (
    node.type === "primitive_type" ||
    node.type === "named_type" ||
    node.type === "type_variable" ||
    node.type === "unit_type"
  ) {
    return true;
  }

  if (node.type === "list_type" || node.type === "set_type") {
    const element = node.childForFieldName("element");
    return Boolean(element && canFormatType(element));
  }

  if (node.type === "type_application") {
    const typeConstructor = node.childForFieldName("constructor");
    const arguments_ = node.childrenForFieldName("argument");
    return Boolean(
      typeConstructor &&
        arguments_.length > 0 &&
        arguments_.every((argument) => canFormatType(argument)),
    );
  }

  if (node.type === "tuple_type") {
    const elements = node.childrenForFieldName("element");
    return elements.length >= 2 && elements.every((element) => canFormatType(element));
  }

  if (node.type === "record_type") {
    const fields = node.namedChildren.filter((child) => child.type === "record_type_field");
    const row = node.childForFieldName("row");
    const rowName = row?.childForFieldName("name");
    return (
      (!row || rowName?.type === "identifier") &&
      fields.every((field) => {
        const name = field.childForFieldName("name");
        const fieldType = field.childForFieldName("type");
        return Boolean(name && fieldType && canFormatType(fieldType));
      })
    );
  }

  if (node.type === "function_type") {
    const parameter = node.childForFieldName("parameter");
    const result = node.childForFieldName("result");
    return Boolean(parameter && result && canFormatType(parameter) && canFormatType(result));
  }

  if (node.type === "operator_type") {
    const parameters = node.childrenForFieldName("parameter");
    const result = node.childForFieldName("result");
    return Boolean(
      result && parameters.every((parameter) => canFormatType(parameter)) && canFormatType(result),
    );
  }

  if (node.type === "parenthesized_type") {
    const innerType = node.childForFieldName("type");
    return Boolean(innerType && canFormatType(innerType));
  }

  if (node.type === "sum_type") {
    const variants = node.namedChildren.filter((child) => child.type === "sum_type_variant");
    return (
      variants.length > 0 &&
      variants.every((variant) => {
        const name = variant.childForFieldName("name");
        const payload = variant.childForFieldName("payload");
        return Boolean(name && (!payload || canFormatType(payload)));
      })
    );
  }

  return false;
}

function formatSumVariant(variant: Parser.SyntaxNode): string {
  const name = variant.childForFieldName("name");
  const payload = variant.childForFieldName("payload");
  if (!name) {
    throw new Error("Unable to locate the sum variant name");
  }
  return `${name.text}${payload ? `(${formatType(payload)})` : ""}`;
}

function formatType(node: Parser.SyntaxNode): string {
  if (
    node.type === "primitive_type" ||
    node.type === "named_type" ||
    node.type === "type_variable"
  ) {
    return node.text;
  }

  if (node.type === "unit_type") {
    return "()";
  }

  if (node.type === "list_type") {
    const element = node.childForFieldName("element");
    if (!element) {
      throw new Error("Unable to locate the list element type");
    }
    return `List[${formatType(element)}]`;
  }

  if (node.type === "set_type") {
    const element = node.childForFieldName("element");
    if (!element) {
      throw new Error("Unable to locate the set element type");
    }
    return `Set[${formatType(element)}]`;
  }

  if (node.type === "type_application") {
    const typeConstructor = node.childForFieldName("constructor");
    const arguments_ = node.childrenForFieldName("argument");
    if (!typeConstructor || arguments_.length === 0) {
      throw new Error("Unable to locate the applied type fields");
    }
    return `${typeConstructor.text}[${arguments_.map(formatType).join(", ")}]`;
  }

  if (node.type === "tuple_type") {
    const elements = node.childrenForFieldName("element");
    if (elements.length < 2) {
      throw new Error("Unable to locate the tuple element types");
    }
    return `(${elements.map(formatType).join(", ")})`;
  }

  if (node.type === "record_type") {
    const fields = node.namedChildren.filter((child) => child.type === "record_type_field");
    if (fields.length === 0) {
      return "{}";
    }
    const formattedFields = fields.map((field) => {
      const name = field.childForFieldName("name");
      const fieldType = field.childForFieldName("type");
      if (!name || !fieldType) {
        throw new Error("Unable to locate a record field type");
      }
      return `${name.text}: ${formatType(fieldType)}`;
    });
    const row = node.childForFieldName("row");
    const rowSuffix = row ? ` | ${row.text}` : "";
    return `{ ${formattedFields.join(", ")}${rowSuffix} }`;
  }

  if (node.type === "function_type") {
    const parameter = node.childForFieldName("parameter");
    const result = node.childForFieldName("result");
    if (!parameter || !result) {
      throw new Error("Unable to locate the function type operands");
    }
    return `${formatType(parameter)} -> ${formatType(result)}`;
  }

  if (node.type === "operator_type") {
    const parameters = node.childrenForFieldName("parameter");
    const result = node.childForFieldName("result");
    const hasParentheses = node.children.some((child) => child.type === "(");
    if (!result) {
      throw new Error("Unable to locate the operator result type");
    }
    const parameterList = hasParentheses
      ? `(${parameters.map(formatType).join(", ")})`
      : parameters.length === 1
        ? formatType(parameters[0] as Parser.SyntaxNode)
        : undefined;
    if (parameterList === undefined) {
      throw new Error("Unable to locate the operator parameter types");
    }
    return `${parameterList} => ${formatType(result)}`;
  }

  if (node.type === "parenthesized_type") {
    const innerType = node.childForFieldName("type");
    if (!innerType) {
      throw new Error("Unable to locate the parenthesized type");
    }
    return `(${formatType(innerType)})`;
  }

  if (node.type === "sum_type") {
    const variants = node.namedChildren.filter((child) => child.type === "sum_type_variant");
    if (variants.length === 0) {
      throw new Error("Unable to locate the sum type variants");
    }
    return variants.map(formatSumVariant).join(" | ");
  }

  throw new Error("Formatting this type syntax is not implemented yet");
}

function formatExpandedRecordType(node: Parser.SyntaxNode): Doc {
  const row = node.childForFieldName("row");
  const entries = node.namedChildren.map((child) => {
    if (child.type === "comment" || child.type === "documentation_comment") {
      return commentDocument(child);
    }
    if (child.type === "record_type_field") {
      const name = child.childForFieldName("name");
      const fieldType = child.childForFieldName("type");
      if (!name || !fieldType) throw new Error("Unable to locate a commented record field type");
      return text(`${name.text}: ${formatType(fieldType)},`);
    }
    if (row && child.id === row.id) {
      return text(`| ${row.text}`);
    }
    throw new Error("Formatting this commented record type syntax is not implemented yet");
  });
  return concat([
    text("{"),
    indent(concat(entries.flatMap((entry) => [hardLine, entry]))),
    hardLine,
    text("}"),
  ]);
}

function commentDocument(node: Parser.SyntaxNode): Doc {
  const continuationPrefix = " ".repeat(node.startPosition.column);
  const lines = node.text.split(/\r\n|\r|\n/).map((line, index) => {
    if (index === 0 || continuationPrefix.length === 0) {
      return line;
    }

    return line.startsWith(continuationPrefix) ? line.slice(continuationPrefix.length) : line;
  });

  return concat(
    lines.flatMap((line, index) => (index === 0 ? [text(line)] : [hardLine, text(line)])),
  );
}

function leadingCommentsDocument(
  comments: Parser.SyntaxNode[],
  declaration: Parser.SyntaxNode,
): Doc {
  return concat(
    comments.flatMap((comment, index) => {
      const next = comments[index + 1] ?? declaration;
      const lineBreaks = Math.max(1, next.startPosition.row - comment.endPosition.row);
      return [commentDocument(comment), ...Array.from({ length: lineBreaks }, () => hardLine)];
    }),
  );
}

function isBlockBodiedIfExpression(node: Parser.SyntaxNode): boolean {
  if (node.type !== "if_expression") return false;
  const consequence = node.childForFieldName("consequence");
  const alternative = node.childForFieldName("alternative");
  return consequence?.type === "block_expression" || alternative?.type === "block_expression";
}

function requiresDefinitionBodyLineBreak(node: Parser.SyntaxNode): boolean {
  return isBlockBodiedIfExpression(node) || node.type === "match_expression";
}

function isMultilineLambdaExpression(node: Parser.SyntaxNode): boolean {
  if (node.type !== "lambda_expression") return false;
  const arrow = node.children.find((child) => child.type === "=>");
  const body = node.childForFieldName("body");
  return Boolean(
    arrow &&
      body &&
      (body.startPosition.row > arrow.endPosition.row ||
        (body.type !== "block_expression" && body.endPosition.row > arrow.endPosition.row)),
  );
}

function isMultilineParenthesizedPostfixReceiver(node: Parser.SyntaxNode): boolean {
  if (node.type !== "parenthesized_expression") return false;
  const expression = node.childForFieldName("expression");
  const parent = node.parent;
  return Boolean(
    expression &&
      expression.startPosition.row < expression.endPosition.row &&
      parent?.type === "field_access_expression" &&
      parent.childForFieldName("object")?.id === node.id,
  );
}

function ufcsChainRoot(node: Parser.SyntaxNode): Parser.SyntaxNode {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    const continuesThroughCall =
      parent.type === "call_expression" && parent.childForFieldName("function")?.id === current.id;
    const continuesThroughField =
      parent.type === "field_access_expression" &&
      parent.childForFieldName("object")?.id === current.id;
    if (!continuesThroughCall && !continuesThroughField) break;
    current = parent;
  }
  return current;
}

function ufcsChainFields(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const fields: Parser.SyntaxNode[] = [];
  let current: Parser.SyntaxNode | null = ufcsChainRoot(node);
  while (current) {
    if (current.type === "call_expression") {
      current = current.childForFieldName("function");
      continue;
    }
    if (current.type === "field_access_expression") {
      fields.push(current);
      current = current.childForFieldName("object");
      continue;
    }
    break;
  }
  return fields.reverse();
}

function isMultilineUfcsContinuation(node: Parser.SyntaxNode): boolean {
  if (node.type !== "field_access_expression") return false;
  const object = node.childForFieldName("object");
  const dot = node.children.find((child) => child.type === ".");
  const hasComments = node.namedChildren.some(
    (child) => child.type === "comment" || child.type === "documentation_comment",
  );
  return Boolean(object && dot && !hasComments && dot.startPosition.row > object.endPosition.row);
}

function ufcsContinuationIndentation(node: Parser.SyntaxNode): number {
  const root = ufcsChainRoot(node);
  const firstContinuation = ufcsChainFields(node).find(isMultilineUfcsContinuation);
  const dot = firstContinuation?.children.find((child) => child.type === ".");
  const spaces = dot ? dot.startPosition.column - root.startPosition.column : 2;
  return Math.max(1, Math.round(spaces / 2));
}

function indentBy(document: Doc, levels: number): Doc {
  let indented = document;
  for (let level = 0; level < levels; level += 1) indented = indent(indented);
  return indented;
}

function preservesDefinitionBodyLineBreak(
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
): boolean {
  const equals = definition.children.find((child) => child.type === "=");
  const hasBodyComments = definition.namedChildren.some(
    (child) =>
      (child.type === "comment" || child.type === "documentation_comment") &&
      equals &&
      child.startIndex >= equals.endIndex &&
      child.endIndex <= body.startIndex,
  );
  return Boolean(equals && !hasBodyComments && body.startPosition.row > equals.endPosition.row);
}

function definitionBodyDocument(
  head: string,
  definition: Parser.SyntaxNode,
  body: Parser.SyntaxNode,
  bodyDocument: Doc,
): Doc {
  const comments = definition.namedChildren.filter(
    (child) =>
      (child.type === "comment" || child.type === "documentation_comment") &&
      child.endIndex <= body.startIndex,
  );
  if (comments.length === 0) {
    return requiresDefinitionBodyLineBreak(body) ||
      preservesDefinitionBodyLineBreak(definition, body)
      ? concat([text(head), indent(concat([hardLine, bodyDocument]))])
      : concat([text(`${head} `), bodyDocument]);
  }
  return concat([
    text(head),
    indent(
      concat([
        ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
        hardLine,
        bodyDocument,
      ]),
    ),
  ]);
}

function formatPattern(node: Parser.SyntaxNode): string {
  if (node.type === "identifier" || node.type === "hole") {
    return node.text;
  }
  if (node.type === "tuple_pattern") {
    return `(${node.childrenForFieldName("element").map(formatPattern).join(", ")})`;
  }
  if (node.type === "record_pattern") {
    return `{ ${node.childrenForFieldName("field").map(formatPattern).join(", ")} }`;
  }
  if (node.type === "qualified_identifier") {
    const namespace = node.childForFieldName("namespace");
    const names = node.childrenForFieldName("name");
    if (!namespace || names.length === 0) {
      throw new Error("Unable to locate the qualified pattern name");
    }
    return [namespace.text, ...names.map((name) => name.text)].join("::");
  }
  throw new Error("Formatting this binding pattern is not implemented yet");
}

function formatCommentedTuplePattern(node: Parser.SyntaxNode): Doc {
  const elements = node.childrenForFieldName("element");
  const entries = node.namedChildren.map((child) => {
    if (child.type === "comment" || child.type === "documentation_comment") {
      return commentDocument(child);
    }
    const index = elements.findIndex((element) => element.id === child.id);
    if (index < 0) throw new Error("Formatting this tuple pattern content is not implemented yet");
    return text(`${formatPattern(child)}${index < elements.length - 1 ? "," : ""}`);
  });
  return concat([
    text("("),
    indent(concat(entries.flatMap((entry) => [hardLine, entry]))),
    hardLine,
    text(")"),
  ]);
}

function collectNodes(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  return [
    ...(node.type === type ? [node] : []),
    ...node.namedChildren.flatMap((child) => collectNodes(child, type)),
  ];
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
        ...trailingComments.flatMap((comment) => [text(" "), commentDocument(comment)]),
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
        ...trailingComments.flatMap((comment) => [text(" "), commentDocument(comment)]),
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
    return {
      document: concat([
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
    const entries = node.namedChildren.map((element) => {
      if (element.type === "comment" || element.type === "documentation_comment") {
        return { node: element, document: commentDocument(element) };
      }
      const value = element.childForFieldName("value");
      if (!value) {
        throw new Error("Unable to locate a record literal element value");
      }
      const analysis = analyzeExpression(value);
      if (element.type === "record_spread") {
        return { node: element, document: concat([text("..."), analysis.document]), analysis };
      }
      const name = element.childForFieldName("name");
      if (element.type !== "record_literal_field" || !name) {
        throw new Error("Formatting this record literal element is not implemented yet");
      }
      return {
        node: element,
        document: concat([text(`${name.text}: `), analysis.document]),
        analysis,
      };
    });
    const analyses = entries.flatMap((entry) => (entry.analysis ? [entry.analysis] : []));
    const hasComments = entries.some(
      ({ node: entry }) => entry.type === "comment" || entry.type === "documentation_comment",
    );
    const isExpanded = hasComments || node.startPosition.row < node.endPosition.row;
    const lineDocuments: Doc[] = [];
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
        } else {
          lineDocuments.push(isComment ? entry.document : concat([entry.document, text(",")]));
        }
      }
    }
    return {
      document: isExpanded
        ? concat([
            text("{"),
            indent(concat(lineDocuments.flatMap((document) => [hardLine, document]))),
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
                indentBy(
                  concat([hardLine, text(`.${field.text}`)]),
                  ufcsContinuationIndentation(node),
                ),
              ])
            : concat([analysis.document, text(`.${field.text}`)])
          : concat([
              analysis.document,
              ...comments.flatMap((comment) => [hardLine, commentDocument(comment)]),
              hardLine,
              text(`.${field.text}`),
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
    const analysis = analyzeExpression(body);
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.endIndex <= body.startIndex,
    );
    const isMultilineBody = isMultilineLambdaExpression(node);
    return {
      document:
        comments.length === 0
          ? isMultilineBody
            ? concat([
                parameterDocument,
                text(" =>"),
                indent(concat([hardLine, analysis.document])),
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
    const preservesConsequenceLineBreak =
      consequence.type !== "block_expression" &&
      consequenceComments.length === 0 &&
      consequence.startPosition.row > closeParen.endPosition.row;
    const preservesElseLineBreak =
      consequence.type !== "block_expression" &&
      alternativeComments.length === 0 &&
      elseKeyword.startPosition.row > consequence.endPosition.row;
    const preservesAlternativeLineBreak =
      alternative.type !== "block_expression" &&
      alternativeComments.length === 0 &&
      alternative.startPosition.row > elseKeyword.endPosition.row;
    return {
      document: concat([
        text("if ("),
        conditionAnalysis.document,
        ...(consequenceComments.length === 0
          ? preservesConsequenceLineBreak
            ? [text(")"), indent(concat([hardLine, consequenceAnalysis.document]))]
            : [text(") "), consequenceAnalysis.document]
          : [
              text(")"),
              indent(
                concat([
                  ...consequenceComments.flatMap((comment) => [hardLine, commentDocument(comment)]),
                  hardLine,
                  consequenceAnalysis.document,
                ]),
              ),
            ]),
        ...(alternativeComments.length === 0
          ? [
              ...(preservesElseLineBreak ? [hardLine, text("else")] : [text(" else")]),
              ...(preservesAlternativeLineBreak
                ? [indent(concat([hardLine, alternativeAnalysis.document]))]
                : [text(" "), alternativeAnalysis.document]),
            ]
          : [
              text(" else"),
              indent(
                concat([
                  ...alternativeComments.flatMap((comment) => [hardLine, commentDocument(comment)]),
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
      const pattern = `${variant.text}${parameter ? `(${parameter.text})` : ""}`;
      const isMultilineBody = body.startPosition.row > arrow.endPosition.row;
      return {
        node: arm,
        body: bodyAnalysis,
        document:
          comments.length === 0
            ? isMultilineBody
              ? concat([
                  text(`| ${pattern} =>`),
                  indent(concat([hardLine, indent(bodyAnalysis.document)])),
                ])
              : concat([text(`| ${pattern} => `), indent(bodyAnalysis.document)])
            : concat([
                text(`| ${pattern} =>`),
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
      document: concat([
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
    const comments = node.namedChildren.filter(
      (child) =>
        (child.type === "comment" || child.type === "documentation_comment") &&
        child.startIndex >= definition.endIndex &&
        child.endIndex <= body.startIndex,
    );
    const definitionValue =
      definition.childForFieldName("value") ?? definition.childForFieldName("body");
    const preservesBodyGap =
      comments.length === 0 &&
      definitionValue !== null &&
      body.startPosition.row > definitionValue.endPosition.row + 1;
    const analyses = [definitionAnalysis, bodyAnalysis];
    return {
      document: concat([
        definitionAnalysis.document,
        hardLine,
        ...(preservesBodyGap ? [hardLine] : []),
        ...comments.flatMap((comment) => [commentDocument(comment), hardLine]),
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
    const contentDocuments = node.namedChildren.map((child) => {
      if (child.type === "comment" || child.type === "documentation_comment") {
        return commentDocument(child);
      }
      if (child.id === expression.id) {
        return analysis.document;
      }
      const bindingIndex = bindings.findIndex((binding) => binding.id === child.id);
      const binding = bindingAnalyses[bindingIndex];
      if (binding) {
        return concat([text(`nondet ${binding.name.text} = `), binding.value.document]);
      }
      throw new Error("Formatting this block content is not implemented yet");
    });
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
    if (!keyword || entries.length === 0) {
      throw new Error("Unable to locate the block combinator entries");
    }
    const analyses = entries.map(analyzeExpression);
    const contentDocuments: Doc[] = [];
    let previousEntry: Parser.SyntaxNode | undefined;
    for (const child of node.namedChildren) {
      if (child.type === "comment" || child.type === "documentation_comment") {
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
        } else {
          contentDocuments.push(commentDocument(child));
        }
        continue;
      }
      const entryIndex = entries.findIndex((entry) => entry.id === child.id);
      const entry = analyses[entryIndex];
      if (!entry)
        throw new Error("Formatting this block combinator content is not implemented yet");
      contentDocuments.push(concat([entry.document, text(",")]));
      previousEntry = child;
    }
    return {
      document: concat([
        text(`${keyword.text} {`),
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

  if (node.type === "call_expression") {
    const functionNode = node.childForFieldName("function");
    const arguments_ = node.childrenForFieldName("argument");
    if (!functionNode) throw new Error("Unable to locate the call target");
    const openParenthesis = node.children.find((child) => child.type === "(");
    const closeParenthesis = [...node.children].reverse().find((child) => child.type === ")");
    const functionAnalysis = analyzeExpression(functionNode);
    const analyses = arguments_.map(analyzeExpression);
    const hasComments = node.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
    const multilineLambdaArgument =
      arguments_.length === 1 && isMultilineLambdaExpression(arguments_[0] as Parser.SyntaxNode);
    const multilineUfcsCall = isMultilineUfcsContinuation(functionNode);
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
    const exceedsLineWidth = inlineCallLines.some(
      (line, index) => line.length + (index === 0 ? node.startPosition.column : 0) > 120,
    );
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
    const sourceMultilineCall =
      arguments_.length > 0 &&
      exceedsLineWidth &&
      (hasSourceArgumentBreak || hasSourceClosingBreak);
    const sourceArgumentDocuments = analyses.flatMap((analysis, index) => {
      const argument = arguments_[index] as Parser.SyntaxNode;
      const previous = index === 0 ? openParenthesis : arguments_[index - 1];
      const startsOnNewLine = Boolean(
        previous && argument.startPosition.row > previous.endPosition.row,
      );
      return [
        ...(index > 0 ? [text(",")] : []),
        ...(startsOnNewLine ? [hardLine] : index > 0 ? [text(" ")] : []),
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
              ...(argumentIndex < arguments_.length - 1 ? [text(",")] : []),
            ]),
          ];
        })
      : [];
    return {
      document: hasComments
        ? concat([
            functionAnalysis.document,
            text("("),
            indent(concat(contentDocuments.flatMap((document) => [hardLine, document]))),
            hardLine,
            text(")"),
          ])
        : multilineLambdaArgument
          ? concat([
              functionAnalysis.document,
              text("("),
              (analyses[0] as ExpressionAnalysis).document,
              hardLine,
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
                  ufcsContinuationIndentation(functionNode),
                ),
              ])
            : sourceMultilineCall
              ? concat([
                  functionAnalysis.document,
                  text("("),
                  indent(concat(sourceArgumentDocuments)),
                  ...(hasSourceClosingBreak ? [hardLine] : []),
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
    if (inlineComments.some((comment) => /[\r\n]/.test(comment.text))) {
      throw new Error("Formatting this inline comment syntax is not implemented yet");
    }

    const leftAnalysis = analyzeExpression(left);
    const rightAnalysis = analyzeExpression(right);
    const comments = inlineComments.flatMap((comment) => [text(" "), commentDocument(comment)]);
    return {
      document:
        rightComments.length === 0
          ? concat([
              leftAnalysis.document,
              ...comments,
              text(` ${operator.text} `),
              rightAnalysis.document,
            ])
          : concat([
              leftAnalysis.document,
              ...comments,
              text(` ${operator.text}`),
              indent(
                concat([
                  ...rightComments.flatMap((comment) => [hardLine, commentDocument(comment)]),
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
    return {
      document:
        isMultilineParenthesizedPostfixReceiver(node) && !isBlockBodiedLambda
          ? concat([text("("), analysis.document, hardLine, text(")")])
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

function analyzeModuleNode(moduleNode: Parser.SyntaxNode) {
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
      if (
        previousDeclaration &&
        pendingComments.length === 0 &&
        node.startPosition.row === previousDeclaration.node.endPosition.row
      ) {
        previousDeclaration.trailingComments = [
          ...(previousDeclaration.trailingComments ?? []),
          node,
        ];
        const preservesSumVariantAlignment = previousDeclaration.valueNode?.type === "sum_type";
        const commentGap = preservesSumVariantAlignment
          ? moduleNode.text.slice(
              previousDeclaration.node.endIndex - moduleNode.startIndex,
              node.startIndex - moduleNode.startIndex,
            )
          : " ";
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
        document: concat([text(`assume ${declarationName.text} = `), expression.document]),
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
            parameterCommas.length === parameters.length - 1 &&
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
      const parameterList =
        openParen && closeParen
          ? `(${parameterNames
              .map((parameterName, index) => {
                const parameterType = parameterTypes[index];
                return `${parameterName?.text}${parameterType ? `: ${formatType(parameterType)}` : ""}`;
              })
              .join(", ")})`
          : "";
      const returnTypeAnnotation = returnType ? `: ${formatType(returnType)}` : "";
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
        semicolon,
        equals,
        valueNode: body,
        binaryOperators: expression.binaryOperators,
        unitLiterals: expression.unitLiterals,
        sequenceLiterals: expression.sequenceLiterals,
        recordLiterals: expression.recordLiterals,
        callExpressions: expression.callExpressions,
        document: definitionBodyDocument(
          `${definitionHead} ${declarationName.text}${parameterList}${returnTypeAnnotation} =`,
          node,
          body,
          expression.document,
        ),
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
      const overrideDocuments = hasComments
        ? node.namedChildren
            .filter(
              (child) =>
                child.id !== importedModule.id &&
                child.id !== alias?.id &&
                child.id !== sourceNode?.id,
            )
            .map((child) => {
              if (child.type === "comment" || child.type === "documentation_comment") {
                return commentDocument(child);
              }
              const index = overrideAnalyses.findIndex((override) => override.node.id === child.id);
              const override = overrideAnalyses[index];
              if (!override) {
                throw new Error("Formatting this instance override content is not implemented yet");
              }
              return concat([
                text(`${formatPattern(override.name)} = `),
                override.value.document,
                ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
              ]);
            })
        : [];
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
      const overrideDocuments = hasComments
        ? node.namedChildren
            .filter((child) => child.id !== importedModule.id && child.id !== sourceNode?.id)
            .map((child) => {
              if (child.type === "comment" || child.type === "documentation_comment") {
                return commentDocument(child);
              }
              const index = overrideAnalyses.findIndex((override) => override.node.id === child.id);
              const override = overrideAnalyses[index];
              if (!override) {
                throw new Error(
                  "Formatting this anonymous override content is not implemented yet",
                );
              }
              return concat([
                text(`${formatPattern(override.name)} = `),
                override.value.document,
                ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
              ]);
            })
        : [];
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

    addDeclaration({
      node,
      keyword,
      nameNode: declarationName,
      colon,
      typeNode: declarationType,
      typeRoots: [declarationType],
      document: text(`${keywordType} ${declarationName.text}: ${formatType(declarationType)}`),
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

function analyzeSource(source: string) {
  const root = parseQuint(source);
  let hashbang: Parser.SyntaxNode | undefined;
  let pendingComments: Parser.SyntaxNode[] = [];
  const modules: Array<
    ReturnType<typeof analyzeModuleNode> & { leadingComments: Parser.SyntaxNode[] }
  > = [];

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

function checkTypeDelimiterSpacing(
  node: Parser.SyntaxNode,
  source: string,
  lines: string[],
  filePath: string,
  diagnostics: FormatDiagnostic[],
) {
  if (node.type === "unit_type") {
    const openParen = node.children.find((child) => child.type === "(");
    const closeParen = node.children.find((child) => child.type === ")");
    if (!openParen || !closeParen) {
      throw new Error("Unable to locate the unit type delimiters");
    }
    const insideParentheses = source.slice(openParen.endIndex, closeParen.startIndex);
    if (insideParentheses !== "") {
      const row = openParen.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.endPosition.column + 1,
        length: Math.max(1, insideParentheses.length),
        rule: "format/type-delimiter-spacing",
        message: "expected no space inside '()'",
        sourceLine: lines[row] ?? "",
      });
    }
    return;
  }

  if (node.type === "sum_type") {
    const variants = node.namedChildren.filter((child) => child.type === "sum_type_variant");
    const pipes = node.children.filter((child) => child.type === "|");
    const isMultiline = node.startPosition.row < node.endPosition.row;
    if (isMultiline) {
      for (const variant of variants) {
        const pipe = pipes.find(
          (candidate) =>
            candidate.startPosition.row === variant.startPosition.row &&
            candidate.endIndex <= variant.startIndex,
        );
        if (!pipe) {
          throw new Error("Unable to locate the multiline sum variant separator");
        }
        if (pipe.startPosition.column !== 4) {
          const row = pipe.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: 1,
            length: Math.max(1, pipe.startPosition.column),
            rule: "format/sum-variant-indentation",
            message: "expected 4 spaces of indentation",
            sourceLine: lines[row] ?? "",
          });
        }
        const afterPipe = source.slice(pipe.endIndex, variant.startIndex);
        if (afterPipe !== " ") {
          const row = pipe.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: pipe.startPosition.column + 1,
            length: 1,
            rule: "format/type-separator-spacing",
            message: "expected one space after '|'",
            sourceLine: lines[row] ?? "",
          });
        }
      }
    } else {
      for (const pipe of pipes) {
        const previousVariant = [...variants]
          .reverse()
          .find((variant) => variant.endIndex <= pipe.startIndex);
        const nextVariant = variants.find((variant) => variant.startIndex >= pipe.endIndex);
        if (!previousVariant || !nextVariant) {
          continue;
        }
        const beforePipe = source.slice(previousVariant.endIndex, pipe.startIndex);
        const afterPipe = source.slice(pipe.endIndex, nextVariant.startIndex);
        if (beforePipe !== " " || afterPipe !== " ") {
          const row = pipe.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: pipe.startPosition.column + 1,
            length: 1,
            rule: "format/type-separator-spacing",
            message: "expected one space around '|'",
            sourceLine: lines[row] ?? "",
          });
        }
      }
    }

    for (const variant of variants) {
      const payload = variant.childForFieldName("payload");
      if (!payload) {
        continue;
      }
      const openParen = variant.children.find((child) => child.type === "(");
      const closeParen = variant.children.find((child) => child.type === ")");
      if (!openParen || !closeParen) {
        throw new Error("Unable to locate the sum variant payload delimiters");
      }
      const afterOpenParen = source.slice(openParen.endIndex, payload.startIndex);
      if (afterOpenParen !== "") {
        const row = openParen.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openParen.endPosition.column + 1,
          length: Math.max(1, afterOpenParen.length),
          rule: "format/type-delimiter-spacing",
          message: "expected no space after '('",
          sourceLine: lines[row] ?? "",
        });
      }
      const beforeCloseParen = source.slice(payload.endIndex, closeParen.startIndex);
      if (beforeCloseParen !== "") {
        const row = closeParen.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: payload.endPosition.column + 1,
          length: Math.max(1, beforeCloseParen.length),
          rule: "format/type-delimiter-spacing",
          message: "expected no space before ')'",
          sourceLine: lines[row] ?? "",
        });
      }
      checkTypeDelimiterSpacing(payload, source, lines, filePath, diagnostics);
    }
    return;
  }

  if (node.type === "parenthesized_type") {
    const openParen = node.children.find((child) => child.type === "(");
    const closeParen = node.children.find((child) => child.type === ")");
    const innerType = node.childForFieldName("type");
    if (!openParen || !closeParen || !innerType) {
      throw new Error("Unable to locate the parenthesized type delimiters");
    }
    const afterOpenParen = source.slice(openParen.endIndex, innerType.startIndex);
    if (afterOpenParen !== "") {
      const row = openParen.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.endPosition.column + 1,
        length: Math.max(1, afterOpenParen.length),
        rule: "format/type-delimiter-spacing",
        message: "expected no space after '('",
        sourceLine: lines[row] ?? "",
      });
    }
    checkTypeDelimiterSpacing(innerType, source, lines, filePath, diagnostics);
    const beforeCloseParen = source.slice(innerType.endIndex, closeParen.startIndex);
    if (beforeCloseParen !== "") {
      const row = closeParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: innerType.endPosition.column + 1,
        length: Math.max(1, beforeCloseParen.length),
        rule: "format/type-delimiter-spacing",
        message: "expected no space before ')'",
        sourceLine: lines[row] ?? "",
      });
    }
    return;
  }

  if (node.type === "operator_type") {
    const parameters = node.childrenForFieldName("parameter");
    const result = node.childForFieldName("result");
    const arrow = node.children.find((child) => child.type === "=>");
    const openParen = node.children.find((child) => child.type === "(");
    const closeParen = node.children.find((child) => child.type === ")");
    if (!result || !arrow) {
      throw new Error("Unable to locate the operator type result");
    }

    if (openParen && closeParen && parameters.length > 0) {
      const firstParameter = parameters[0];
      const lastParameter = parameters.at(-1);
      if (!firstParameter || !lastParameter) {
        throw new Error("Unable to locate the operator parameters");
      }
      const afterOpenParen = source.slice(openParen.endIndex, firstParameter.startIndex);
      if (afterOpenParen !== "") {
        const row = openParen.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openParen.endPosition.column + 1,
          length: Math.max(1, afterOpenParen.length),
          rule: "format/type-delimiter-spacing",
          message: "expected no space after '('",
          sourceLine: lines[row] ?? "",
        });
      }

      const commas = node.children.filter((child) => child.type === ",");
      for (const [index, comma] of commas.entries()) {
        const previousParameter = parameters[index];
        const nextParameter = parameters[index + 1];
        if (!previousParameter || !nextParameter) {
          throw new Error("Unable to locate operator parameter types around ','");
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
            rule: "format/type-separator-spacing",
            message: "expected ', ' between types",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      const beforeCloseParen = source.slice(lastParameter.endIndex, closeParen.startIndex);
      if (beforeCloseParen !== "") {
        const row = closeParen.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: lastParameter.endPosition.column + 1,
          length: Math.max(1, beforeCloseParen.length),
          rule: "format/type-delimiter-spacing",
          message: "expected no space before ')'",
          sourceLine: lines[row] ?? "",
        });
      }
    } else if (openParen && closeParen) {
      const insideParentheses = source.slice(openParen.endIndex, closeParen.startIndex);
      if (insideParentheses !== "") {
        const row = openParen.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openParen.endPosition.column + 1,
          length: Math.max(1, insideParentheses.length),
          rule: "format/type-delimiter-spacing",
          message: "expected no space inside '()'",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    const arrowAnchor = closeParen ?? parameters.at(-1);
    if (!arrowAnchor) {
      throw new Error("Unable to locate the operator arrow anchor");
    }
    const beforeArrow = source.slice(arrowAnchor.endIndex, arrow.startIndex);
    const afterArrow = source.slice(arrow.endIndex, result.startIndex);
    if (beforeArrow !== " " || afterArrow !== " ") {
      const row = arrow.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: arrow.startPosition.column + 1,
        length: 2,
        rule: "format/type-operator-spacing",
        message: "expected one space around '=>'",
        sourceLine: lines[row] ?? "",
      });
    }
    for (const parameter of parameters) {
      checkTypeDelimiterSpacing(parameter, source, lines, filePath, diagnostics);
    }
    checkTypeDelimiterSpacing(result, source, lines, filePath, diagnostics);
    return;
  }

  if (node.type === "function_type") {
    const parameter = node.childForFieldName("parameter");
    const result = node.childForFieldName("result");
    const arrow = node.children.find((child) => child.type === "->");
    if (!parameter || !result || !arrow) {
      throw new Error("Unable to locate the function type operator");
    }
    const beforeArrow = source.slice(parameter.endIndex, arrow.startIndex);
    const afterArrow = source.slice(arrow.endIndex, result.startIndex);
    if (beforeArrow !== " " || afterArrow !== " ") {
      const row = arrow.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: arrow.startPosition.column + 1,
        length: 2,
        rule: "format/type-operator-spacing",
        message: "expected one space around '->'",
        sourceLine: lines[row] ?? "",
      });
    }
    checkTypeDelimiterSpacing(parameter, source, lines, filePath, diagnostics);
    checkTypeDelimiterSpacing(result, source, lines, filePath, diagnostics);
    return;
  }

  if (node.type === "record_type") {
    const openBrace = node.children.find((child) => child.type === "{");
    const closeBrace = node.children.find((child) => child.type === "}");
    const fields = node.namedChildren.filter((child) => child.type === "record_type_field");
    const row = node.childForFieldName("row");
    const hasComments = node.namedChildren.some(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
    const isExpanded = hasComments || node.startPosition.row < node.endPosition.row;
    const firstField = fields[0];
    const lastField = fields.at(-1);
    if (!openBrace || !closeBrace) {
      throw new Error("Unable to locate the record type delimiters");
    }
    if (!firstField || !lastField) {
      const insideBraces = source.slice(openBrace.endIndex, closeBrace.startIndex);
      if (insideBraces !== "") {
        const row = openBrace.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: openBrace.endPosition.column + 1,
          length: Math.max(1, insideBraces.length),
          rule: "format/type-delimiter-spacing",
          message: "expected no space inside an empty record type",
          sourceLine: lines[row] ?? "",
        });
      }
      return;
    }

    const afterOpenBrace = source.slice(openBrace.endIndex, firstField.startIndex);
    if (!isExpanded && afterOpenBrace !== " ") {
      const row = openBrace.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openBrace.endPosition.column + 1,
        length: Math.max(1, afterOpenBrace.length),
        rule: "format/type-delimiter-spacing",
        message: "expected one space after '{'",
        sourceLine: lines[row] ?? "",
      });
    }

    const commas = node.children.filter((child) => child.type === ",");
    for (const [index, comma] of commas.entries()) {
      if (isExpanded) continue;
      const previousField = fields[index];
      const nextField = fields[index + 1];
      if (!previousField || !nextField) {
        throw new Error("Unable to locate record fields around ','");
      }
      const beforeComma = source.slice(previousField.endIndex, comma.startIndex);
      const afterComma = source.slice(comma.endIndex, nextField.startIndex);
      if (beforeComma !== "" || afterComma !== " ") {
        const row = comma.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: comma.startPosition.column + 1,
          length: 1,
          rule: "format/type-separator-spacing",
          message: "expected ', ' between record fields",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    for (const field of fields) {
      const name = field.childForFieldName("name");
      const fieldType = field.childForFieldName("type");
      const colon = field.children.find((child) => child.type === ":");
      if (!name || !fieldType || !colon) {
        throw new Error("Unable to locate a record field annotation");
      }
      const beforeColon = source.slice(name.endIndex, colon.startIndex);
      if (beforeColon !== "") {
        const row = name.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: name.endPosition.column + 1,
          length: Math.max(1, beforeColon.length),
          rule: "format/type-colon-spacing",
          message: "expected no space before ':'",
          sourceLine: lines[row] ?? "",
        });
      }
      const afterColon = source.slice(colon.endIndex, fieldType.startIndex);
      if (afterColon !== " ") {
        const row = colon.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: colon.endPosition.column + 1,
          length: Math.max(1, afterColon.length),
          rule: "format/type-colon-spacing",
          message: "expected one space after ':'",
          sourceLine: lines[row] ?? "",
        });
      }
      checkTypeDelimiterSpacing(fieldType, source, lines, filePath, diagnostics);
    }

    if (row && !isExpanded) {
      const pipe = node.children.find((child) => child.type === "|");
      if (!pipe) {
        throw new Error("Unable to locate the record row separator");
      }
      const beforePipe = source.slice(lastField.endIndex, pipe.startIndex);
      const afterPipe = source.slice(pipe.endIndex, row.startIndex);
      if (beforePipe !== " " || afterPipe !== " ") {
        const rowIndex = pipe.startPosition.row;
        diagnostics.push({
          filePath,
          line: rowIndex + 1,
          column: pipe.startPosition.column + 1,
          length: 1,
          rule: "format/record-row-spacing",
          message: "expected one space around '|'",
          sourceLine: lines[rowIndex] ?? "",
        });
      }
    }

    const recordEnd = row ?? lastField;
    const beforeCloseBrace = source.slice(recordEnd.endIndex, closeBrace.startIndex);
    if (!isExpanded && beforeCloseBrace !== " ") {
      const row = closeBrace.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: recordEnd.endPosition.column + 1,
        length: Math.max(1, beforeCloseBrace.length),
        rule: "format/type-delimiter-spacing",
        message: "expected one space before '}'",
        sourceLine: lines[row] ?? "",
      });
    }
    return;
  }

  if (
    node.type !== "set_type" &&
    node.type !== "list_type" &&
    node.type !== "type_application" &&
    node.type !== "tuple_type"
  ) {
    return;
  }

  const openDelimiterText = node.type === "tuple_type" ? "(" : "[";
  const closeDelimiterText = node.type === "tuple_type" ? ")" : "]";
  const openDelimiter = node.children.find((child) => child.type === openDelimiterText);
  const closeDelimiter = node.children.find((child) => child.type === closeDelimiterText);
  const elements =
    node.type === "type_application"
      ? node.childrenForFieldName("argument")
      : node.type === "tuple_type"
        ? node.childrenForFieldName("element")
        : [node.childForFieldName("element")].filter((element) => element !== null);
  const firstElement = elements[0];
  const lastElement = elements.at(-1);
  if (!openDelimiter || !closeDelimiter || !firstElement || !lastElement) {
    throw new Error("Unable to locate the parameterized type delimiters");
  }

  const afterOpenDelimiter = source.slice(openDelimiter.endIndex, firstElement.startIndex);
  if (afterOpenDelimiter !== "") {
    const row = openDelimiter.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: openDelimiter.endPosition.column + 1,
      length: Math.max(1, afterOpenDelimiter.length),
      rule: "format/type-delimiter-spacing",
      message: `expected no space after '${openDelimiterText}'`,
      sourceLine: lines[row] ?? "",
    });
  }

  const commas = node.children.filter((child) => child.type === ",");
  for (const [index, comma] of commas.entries()) {
    const previousElement = elements[index];
    const nextElement = elements[index + 1];
    if (!previousElement || !nextElement) {
      throw new Error("Unable to locate types around ','");
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
        rule: "format/type-separator-spacing",
        message: "expected ', ' between types",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const beforeCloseDelimiter = source.slice(lastElement.endIndex, closeDelimiter.startIndex);
  if (beforeCloseDelimiter !== "") {
    const row = closeDelimiter.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: lastElement.endPosition.column + 1,
      length: Math.max(1, beforeCloseDelimiter.length),
      rule: "format/type-delimiter-spacing",
      message: `expected no space before '${closeDelimiterText}'`,
      sourceLine: lines[row] ?? "",
    });
  }

  for (const element of elements) {
    checkTypeDelimiterSpacing(element, source, lines, filePath, diagnostics);
  }
}

function checkPatternSpacing(
  node: Parser.SyntaxNode,
  source: string,
  lines: string[],
  filePath: string,
  diagnostics: FormatDiagnostic[],
) {
  if (node.type !== "tuple_pattern" && node.type !== "record_pattern") return;
  const isTuple = node.type === "tuple_pattern";
  const openType = isTuple ? "(" : "{";
  const closeType = isTuple ? ")" : "}";
  const openDelimiter = node.children.find((child) => child.type === openType);
  const closeDelimiter = node.children.find((child) => child.type === closeType);
  const elements = node.childrenForFieldName(isTuple ? "element" : "field");
  const commas = node.children.filter((child) => child.type === ",");
  const first = elements[0];
  const last = elements.at(-1);
  if (!openDelimiter || !closeDelimiter || !first || !last) {
    throw new Error(`Unable to locate the ${isTuple ? "tuple" : "record"} pattern delimiters`);
  }
  const expectedDelimiterSpace = isTuple ? "" : " ";
  const afterOpen = source.slice(openDelimiter.endIndex, first.startIndex);
  if (afterOpen !== expectedDelimiterSpace) {
    const row = openDelimiter.endPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: openDelimiter.endPosition.column + 1,
      length: Math.max(1, afterOpen.length),
      rule: "format/pattern-delimiter-spacing",
      message: `expected ${isTuple ? "no" : "one"} space after '${openType}'`,
      sourceLine: lines[row] ?? "",
    });
  }
  for (const [index, comma] of commas.entries()) {
    const previous = elements[index];
    const next = elements[index + 1];
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
        rule: "format/pattern-separator-spacing",
        message: `expected ', ' between pattern ${isTuple ? "elements" : "fields"}`,
        sourceLine: lines[row] ?? "",
      });
    }
  }
  const beforeClose = source.slice(last.endIndex, closeDelimiter.startIndex);
  if (beforeClose !== expectedDelimiterSpace) {
    const row = closeDelimiter.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: last.endPosition.column + 1,
      length: Math.max(1, beforeClose.length),
      rule: "format/pattern-delimiter-spacing",
      message: `expected ${isTuple ? "no" : "one"} space before '${closeType}'`,
      sourceLine: lines[row] ?? "",
    });
  }
  for (const element of elements)
    checkPatternSpacing(element, source, lines, filePath, diagnostics);
}

function checkLocalDefinition(
  node: Parser.SyntaxNode,
  source: string,
  lines: string[],
  filePath: string,
  diagnostics: FormatDiagnostic[],
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
      source.slice(openParen.endIndex, first.startIndex) !== "" ||
      source.slice(last.endIndex, closeParen.startIndex) !== ""
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
  if (
    typeNode &&
    colon &&
    (source.slice(typeAnchor.endIndex, colon.startIndex) !== "" ||
      source.slice(colon.endIndex, typeNode.startIndex) !== " ")
  ) {
    const row = colon.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: colon.startPosition.column + 1,
      length: 1,
      rule: "format/type-colon-spacing",
      message: "expected ': ' before the definition type",
      sourceLine: lines[row] ?? "",
    });
  }

  const value = node.childForFieldName(node.type === "operator_definition" ? "body" : "value");
  const equals = node.children.find((child) => child.type === "=");
  if (value && equals) {
    const anchor = typeNode ?? closeParen ?? name;
    if (
      source.slice(anchor.endIndex, equals.startIndex) !== " " ||
      source.slice(equals.endIndex, value.startIndex) !== " "
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
  }

  const semicolon = node.children.find((child) => child.type === ";");
  if (semicolon) {
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

export function checkQuint(source: string, filePath: string): FormatDiagnostic[] {
  const analyzedSource = analyzeSource(source);
  const formatted = renderSource(analyzedSource);
  const diagnostics: FormatDiagnostic[] = [];

  if (source === formatted) {
    return [];
  }

  const lines = source.split(/\r?\n/);
  for (const [moduleIndex, module] of analyzedSource.modules.entries()) {
    const moduleStart = module.leadingComments[0] ?? module.node;

    for (const comment of module.leadingComments) {
      if (comment.startPosition.column !== 0) {
        const row = comment.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, comment.startPosition.column),
          rule: "format/comment-indentation",
          message: "expected no indentation at the source level",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    const previousModule = moduleIndex > 0 ? analyzedSource.modules[moduleIndex - 1] : undefined;
    if (previousModule) {
      const moduleGap = source.slice(previousModule.node.endIndex, moduleStart.startIndex);
      if (moduleGap !== "\n\n") {
        const row = module.moduleKeyword.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: module.moduleKeyword.startPosition.column + 1,
          length: module.moduleKeyword.text.length,
          rule: "format/module-separation",
          message: "expected one blank line between modules",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    const keywordGap = source.slice(module.moduleKeyword.endIndex, module.nameNode.startIndex);

    if (keywordGap !== " ") {
      const row = module.moduleKeyword.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: module.moduleKeyword.endPosition.column + 1,
        length: Math.max(
          1,
          module.nameNode.startPosition.column - module.moduleKeyword.endPosition.column,
        ),
        rule: "format/module-keyword-spacing",
        message: "expected one space after 'module'",
        sourceLine: lines[row] ?? "",
      });
    }

    const braceGap = source.slice(module.nameNode.endIndex, module.openBrace.startIndex);

    if (braceGap !== " ") {
      const row = module.nameNode.endPosition.row;
      const hasGap = module.openBrace.startPosition.column > module.nameNode.endPosition.column;
      diagnostics.push({
        filePath,
        line: row + 1,
        column:
          (hasGap ? module.nameNode.endPosition.column : module.openBrace.startPosition.column) + 1,
        length: Math.max(
          1,
          module.openBrace.startPosition.column - module.nameNode.endPosition.column,
        ),
        rule: "format/module-brace-spacing",
        message: "expected one space before '{'",
        sourceLine: lines[row] ?? "",
      });
    }

    if (
      module.declarations.length === 0 &&
      module.danglingComments.length === 0 &&
      module.openBrace.startPosition.row === module.closeBrace.startPosition.row
    ) {
      const row = module.openBrace.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: module.openBrace.startPosition.column + 1,
        length: Math.max(
          1,
          module.closeBrace.endPosition.column - module.openBrace.startPosition.column,
        ),
        rule: "format/empty-module",
        message: "empty module braces must be on separate lines",
        sourceLine: lines[row] ?? "",
      });
    }

    for (const comment of module.danglingComments) {
      if (comment.startPosition.column !== 2) {
        const row = comment.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, comment.startPosition.column),
          rule: "format/comment-indentation",
          message: "expected 2 spaces of indentation",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    for (const [index, declaration] of module.declarations.entries()) {
      const previousDeclaration = index > 0 ? module.declarations[index - 1] : undefined;
      const declarationStart = declaration.leadingComments?.[0] ?? declaration.node;
      const sharesLineWithPrevious =
        previousDeclaration?.node.endPosition.row === declarationStart.startPosition.row;

      for (const comment of declaration.leadingComments ?? []) {
        if (comment.startPosition.column !== 2) {
          const row = comment.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: 1,
            length: Math.max(1, comment.startPosition.column),
            rule: "format/comment-indentation",
            message: "expected 2 spaces of indentation",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      for (const comment of declaration.trailingComments ?? []) {
        const commentGap = source.slice(declaration.node.endIndex, comment.startIndex);
        const preservesSumVariantAlignment = declaration.valueNode?.type === "sum_type";
        if (!preservesSumVariantAlignment && commentGap !== " ") {
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

      if (sharesLineWithPrevious) {
        const row = declaration.node.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: declaration.node.startPosition.column + 1,
          length: declaration.keyword.text.length,
          rule: "format/declaration-line-break",
          message: "expected each declaration on a separate line",
          sourceLine: lines[row] ?? "",
        });
      } else {
        if (declaration.node.startPosition.column !== 2) {
          const row = declaration.node.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: 1,
            length: Math.max(1, declaration.node.startPosition.column),
            rule: "format/module-body-indentation",
            message: "expected 2 spaces of indentation",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.qualifier) {
        const qualifierGap = source.slice(
          declaration.qualifier.endIndex,
          declaration.keyword.startIndex,
        );
        if (qualifierGap !== " ") {
          const row = declaration.qualifier.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.qualifier.endPosition.column + 1,
            length: Math.max(
              1,
              declaration.keyword.startPosition.column - declaration.qualifier.endPosition.column,
            ),
            rule: "format/qualifier-spacing",
            message: `expected one space after '${declaration.qualifier.text}'`,
            sourceLine: lines[row] ?? "",
          });
        }
      }

      const keywordGap = source.slice(
        declaration.keyword.endIndex,
        declaration.nameNode.startIndex,
      );
      if (keywordGap !== " ") {
        const row = declaration.keyword.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: declaration.keyword.endPosition.column + 1,
          length: Math.max(
            1,
            declaration.nameNode.startPosition.column - declaration.keyword.endPosition.column,
          ),
          rule: "format/declaration-keyword-spacing",
          message: `expected one space after '${declaration.keyword.text}'`,
          sourceLine: lines[row] ?? "",
        });
      }

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
        if (afterModule !== "" || insideStart !== "" || insideEnd !== "") {
          const row = declaration.instanceOpenParen.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.instanceOpenParen.startPosition.column + 1,
            length: 1,
            rule: "format/instance-delimiter-spacing",
            message: "expected no space around instance parentheses",
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
            source.slice(comma.endIndex, next.startIndex) !== " "
          ) {
            const row = comma.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: comma.startPosition.column + 1,
              length: 1,
              rule: "format/instance-override-separator-spacing",
              message: "expected ', ' between instance overrides",
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
        if (typeGap !== " ") {
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
          requiresDefinitionBodyLineBreak(declaration.valueNode) ||
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
        if (
          beforeOperator !== " " ||
          (operator.rightComments.length === 0 && afterOperator !== " ")
        ) {
          const row = operator.node.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: operator.node.startPosition.column + 1,
            length: operator.node.text.length,
            rule: "format/binary-operator-spacing",
            message: `expected one space around '${operator.node.text}'`,
            sourceLine: lines[row] ?? "",
          });
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
          if (afterOpenDelimiter !== "") {
            const row = openDelimiter.endPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openDelimiter.endPosition.column + 1,
              length: Math.max(1, afterOpenDelimiter.length),
              rule: "format/expression-delimiter-spacing",
              message: `expected no space after '${openType}'`,
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
          if (
            (!trailingComma && beforeCloseDelimiter !== "") ||
            (trailingComma && closeGap !== "")
          ) {
            const row = closeDelimiter.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: closeAnchor.endPosition.column + 1,
              length: Math.max(1, closeGap.length),
              rule: "format/expression-delimiter-spacing",
              message: `expected no space before '${closeType}'`,
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
        const openParen = callExpression.children.find((child) => child.type === "(");
        const closeParen = callExpression.children.find((child) => child.type === ")");
        const arguments_ = callExpression.childrenForFieldName("argument");
        const commas = callExpression.children.filter((child) => child.type === ",");
        const isMultilineLambdaCall =
          arguments_.length === 1 &&
          isMultilineLambdaExpression(arguments_[0] as Parser.SyntaxNode);
        if (!openParen || !closeParen) throw new Error("Unable to locate the call delimiters");
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
          const afterOpen = source.slice(openParen.endIndex, first.startIndex);
          if (afterOpen !== "") {
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
            if (
              source.slice(previous.endIndex, comma.startIndex) !== "" ||
              source.slice(comma.endIndex, next.startIndex) !== " "
            ) {
              const row = comma.startPosition.row;
              diagnostics.push({
                filePath,
                line: row + 1,
                column: comma.startPosition.column + 1,
                length: 1,
                rule: "format/argument-separator-spacing",
                message: "expected ', ' between arguments",
                sourceLine: lines[row] ?? "",
              });
            }
          }
          const trailingComma = commas.find((comma) => comma.startIndex >= last.endIndex);
          const anchor = trailingComma ?? last;
          const beforeClose = source.slice(anchor.endIndex, closeParen.startIndex);
          const hasCanonicalClose = isMultilineLambdaCall
            ? /^(?:\r\n|\r|\n)[\t ]*$/.test(beforeClose)
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
          const hasComments = fieldAccess.namedChildren.some(
            (child) => child.type === "comment" || child.type === "documentation_comment",
          );
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
            dot.startPosition.column !==
              ufcsChainRoot(fieldAccess).startPosition.column +
                ufcsContinuationIndentation(fieldAccess) * 2
          ) {
            const row = dot.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: 1,
              length: Math.max(1, dot.startPosition.column),
              rule: "format/field-access-indentation",
              message: "expected the continuation dot to align with the first chain dot",
              sourceLine: lines[row] ?? "",
            });
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
          const preservesConsequenceLineBreak =
            consequence.type !== "block_expression" &&
            consequenceComments.length === 0 &&
            consequence.startPosition.row > closeParen.endPosition.row;
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
            alternativeComments.length === 0 &&
            elseKeyword.startPosition.row > consequence.endPosition.row;
          const preservesAlternativeLineBreak =
            alternative.type !== "block_expression" &&
            alternativeComments.length === 0 &&
            alternative.startPosition.row > elseKeyword.endPosition.row;
          const expectedElseGap = preservesElseLineBreak
            ? `\n${" ".repeat(conditional.startPosition.column)}`
            : " ";
          const expectedAlternativeGap = preservesAlternativeLineBreak
            ? `\n${" ".repeat(conditional.startPosition.column + 2)}`
            : " ";
          if (
            source.slice(consequence.endIndex, elseKeyword.startIndex) !== expectedElseGap ||
            source.slice(elseKeyword.endIndex, alternative.startIndex) !== expectedAlternativeGap
          ) {
            const row = elseKeyword.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: elseKeyword.startPosition.column + 1,
              length: 4,
              rule: "format/conditional-else-spacing",
              message:
                preservesElseLineBreak || preservesAlternativeLineBreak
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
          const hasCanonicalLines =
            rows[0] !== openBrace.startPosition.row &&
            rows.every((row, index) => index === 0 || row > (rows[index - 1] as number)) &&
            closeBrace.startPosition.row > (rows.at(-1) as number);
          if (!hasCanonicalLines) {
            const row = openBrace.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: openBrace.startPosition.column + 1,
              length: 1,
              rule: "format/match-layout",
              message: "expected match arms and the closing brace on separate lines",
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
            const afterArrow = source.slice(arrow.endIndex, body.startIndex);
            const hasCanonicalBodySeparation =
              afterArrow === " " || /^(?:\r\n|\r|\n)[\t ]*$/.test(afterArrow);
            if (
              source.slice(patternEnd.endIndex, arrow.startIndex) !== " " ||
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
          const hasCanonicalLines =
            rows[0] !== openBrace.startPosition.row &&
            rows.every((row, index) => index === 0 || row > (rows[index - 1] as number)) &&
            closeBrace.startPosition.row > (rows.at(-1) as number);
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
          if (body.startPosition.row <= definition.endPosition.row) {
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
            const hasCanonicalLines =
              rows[0] !== openBrace.startPosition.row &&
              rows.every((row, index) => index === 0 || row > (rows[index - 1] as number)) &&
              closeBrace.startPosition.row > (rows.at(-1) as number);
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
            for (const [index, comma] of commas.entries()) {
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

  for (const [index, comment] of analyzedSource.trailingComments.entries()) {
    if (comment.startPosition.column !== 0) {
      const row = comment.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: 1,
        length: Math.max(1, comment.startPosition.column),
        rule: "format/comment-indentation",
        message: "expected no indentation at the source level",
        sourceLine: lines[row] ?? "",
      });
    }
    const previous =
      index === 0
        ? analyzedSource.modules.at(-1)?.node
        : analyzedSource.trailingComments[index - 1];
    if (previous && source.slice(previous.endIndex, comment.startIndex) !== "\n\n") {
      const row = comment.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: comment.startPosition.column + 1,
        length: Math.max(1, comment.text.length),
        rule: "format/source-comment-separation",
        message: "expected one blank line before a trailing source comment",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  const trailingNewlines = source.match(/(?:\r\n|\r|\n)+$/)?.[0] ?? "";

  if (trailingNewlines !== "\n") {
    const firstExcessIndex =
      trailingNewlines.length === 0 ? source.length : source.length - trailingNewlines.length + 1;
    const position = positionAtIndex(source, firstExcessIndex);
    diagnostics.push({
      filePath,
      line: position.row + 1,
      column: position.column + 1,
      length: 1,
      rule: "format/final-newline",
      message: "expected exactly one final newline",
      sourceLine: lines[position.row] ?? "",
    });
  }

  return diagnostics.sort((left, right) => left.line - right.line || left.column - right.column);
}

function renderModule(module: ReturnType<typeof analyzeModuleNode>): string {
  const declarations = module.declarations.flatMap((declaration, index, allDeclarations) => {
    if (index === 0) {
      const firstContent = declaration.leadingComments?.[0] ?? declaration.node;
      const lineBreaks = Math.min(
        2,
        Math.max(1, firstContent.startPosition.row - module.openBrace.endPosition.row),
      );
      return [...Array.from({ length: lineBreaks }, () => hardLine), declaration.document];
    }
    const previous = allDeclarations[index - 1];
    if (!previous) return [hardLine, declaration.document];
    const previousEnd = previous.trailingComments?.at(-1) ?? previous.node;
    const declarationStart = declaration.leadingComments?.[0] ?? declaration.node;
    const lineBreaks = Math.max(
      1,
      declarationStart.startPosition.row - previousEnd.endPosition.row,
    );
    return [...Array.from({ length: lineBreaks }, () => hardLine), declaration.document];
  });
  const danglingComments = module.danglingComments.flatMap((comment, index, allComments) => {
    const lastDeclaration = module.declarations.at(-1);
    const previous =
      index === 0
        ? (lastDeclaration?.trailingComments?.at(-1) ?? lastDeclaration?.node ?? module.openBrace)
        : allComments[index - 1];
    const lineBreaks = Math.min(
      2,
      Math.max(1, comment.startPosition.row - (previous?.endPosition.row ?? 0)),
    );
    return [...Array.from({ length: lineBreaks }, () => hardLine), commentDocument(comment)];
  });
  const body = [...declarations, ...danglingComments];
  return renderDoc(
    concat([text(`module ${module.name} {`), indent(concat(body)), hardLine, text("}"), hardLine]),
  );
}

function renderSource(source: ReturnType<typeof analyzeSource>): string {
  const hashbang = source.hashbang ? `${source.hashbang.text}\n` : "";
  const modules = source.modules.map((module) => {
    const leadingComments = renderDoc(leadingCommentsDocument(module.leadingComments, module.node));
    return `${leadingComments}${renderModule(module)}`;
  });
  const renderedModules = modules.join("\n");
  const trailingComments = source.trailingComments
    .map((comment) => renderDoc(commentDocument(comment)))
    .join("\n\n");
  return trailingComments
    ? `${hashbang}${renderedModules}\n${trailingComments}\n`
    : `${hashbang}${renderedModules}`;
}

export function renderDiagnostic(diagnostic: FormatDiagnostic): string {
  const lineNumber = String(diagnostic.line);
  const gutter = " ".repeat(lineNumber.length);
  const tabWidth = 2;
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const displayWidth = (value: string): number => {
    let width = 0;
    for (const { segment } of graphemes.segment(value)) {
      if (/\p{Extended_Pictographic}/u.test(segment)) {
        width += 2;
      } else if (
        /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(segment)
      ) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  };
  const expandTabs = (value: string): string => {
    let expanded = "";
    let width = 0;
    for (const character of value) {
      if (character === "\t") {
        const spaces = tabWidth - (width % tabWidth);
        expanded += " ".repeat(spaces);
        width += spaces;
      } else {
        expanded += character;
        width += displayWidth(character);
      }
    }
    return expanded;
  };
  const prefix = diagnostic.sourceLine.slice(0, diagnostic.column - 1);
  const highlighted = diagnostic.sourceLine.slice(
    diagnostic.column - 1,
    diagnostic.column - 1 + diagnostic.length,
  );
  const underline = `${" ".repeat(displayWidth(expandTabs(prefix)))}${"^".repeat(
    Math.max(1, displayWidth(expandTabs(highlighted))),
  )}`;
  const sourceLine = expandTabs(diagnostic.sourceLine);

  return [
    `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}: error[${diagnostic.rule}]: ${diagnostic.message}`,
    `${gutter} |`,
    `${lineNumber} |${sourceLine.length > 0 ? ` ${sourceLine}` : ""}`,
    `${gutter} | ${underline}`,
    `${gutter} |`,
    "",
  ].join("\n");
}
