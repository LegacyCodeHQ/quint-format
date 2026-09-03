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

  constructor(diagnostic: SourceDiagnostic) {
    super(diagnostic.message);
    this.name = "QuintSyntaxError";
    this.diagnostic = diagnostic;
  }
}

function findSyntaxProblem(node: Parser.SyntaxNode): Parser.SyntaxNode | undefined {
  if (node.isError || node.isMissing) {
    return node;
  }

  for (const child of node.children) {
    if (child.hasError) {
      const problem = findSyntaxProblem(child);
      if (problem) {
        return problem;
      }
    }
  }

  return undefined;
}

function parseQuint(source: string): Parser.SyntaxNode {
  const root = parser.parse(source).rootNode;

  if (!root.hasError) {
    return root;
  }

  const problem = findSyntaxProblem(root);
  if (!problem) {
    throw new SyntaxError("Cannot locate the Quint syntax error");
  }

  const isMissingAtEndOfFile = problem.isMissing && source.slice(problem.endIndex).trim() === "";
  const position = isMissingAtEndOfFile ? root.endPosition : problem.startPosition;
  const sourceLine = source.split(/\r?\n/)[position.row] ?? "";
  const length =
    problem.isMissing || problem.startPosition.row !== problem.endPosition.row
      ? 1
      : Math.max(1, problem.endPosition.column - problem.startPosition.column);

  throw new QuintSyntaxError({
    line: position.row + 1,
    column: position.column + 1,
    length,
    rule: problem.isMissing ? "parse/missing-token" : "parse/unexpected-token",
    message: problem.isMissing ? `expected '${problem.type}'` : `unexpected '${problem.text}'`,
    sourceLine,
  });
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
  semicolon?: Parser.SyntaxNode;
  equals?: Parser.SyntaxNode;
  valueNode?: Parser.SyntaxNode;
  binaryOperators?: BinaryOperator[];
  unitLiterals?: Parser.SyntaxNode[];
  document: Doc;
}

interface BinaryOperator {
  node: Parser.SyntaxNode;
  left: Parser.SyntaxNode;
  right: Parser.SyntaxNode;
  inlineComments: Parser.SyntaxNode[];
}

interface ExpressionAnalysis {
  document: Doc;
  binaryOperators: BinaryOperator[];
  unitLiterals: Parser.SyntaxNode[];
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
      fields.length > 0 &&
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
      throw new Error("Unable to locate the record fields");
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

function analyzeExpression(node: Parser.SyntaxNode): ExpressionAnalysis {
  if (
    node.type === "integer_literal" ||
    node.type === "boolean_literal" ||
    node.type === "string_literal" ||
    node.type === "name_reference"
  ) {
    return { document: text(node.text), binaryOperators: [], unitLiterals: [] };
  }

  if (node.type === "unit_literal") {
    return { document: text("()"), binaryOperators: [], unitLiterals: [node] };
  }

  if (node.type === "binary_expression") {
    const left = node.childForFieldName("left");
    const right = node.childForFieldName("right");
    const operator = node.children.find((child) => child.type === "+" || child.type === "-");
    if (!left || !right || !operator) {
      throw new Error("Formatting this binary expression syntax is not implemented yet");
    }

    const inlineComments = node.children.filter(
      (child) =>
        child.type === "comment" &&
        child.startIndex >= left.endIndex &&
        child.endIndex <= operator.startIndex,
    );
    if (inlineComments.some((comment) => /[\r\n]/.test(comment.text))) {
      throw new Error("Formatting this inline comment syntax is not implemented yet");
    }

    const leftAnalysis = analyzeExpression(left);
    const rightAnalysis = analyzeExpression(right);
    const comments = inlineComments.flatMap((comment) => [text(" "), commentDocument(comment)]);
    return {
      document: concat([
        leftAnalysis.document,
        ...comments,
        text(` ${operator.text} `),
        rightAnalysis.document,
      ]),
      binaryOperators: [
        ...leftAnalysis.binaryOperators,
        { node: operator, left, right, inlineComments },
        ...rightAnalysis.binaryOperators,
      ],
      unitLiterals: [...leftAnalysis.unitLiterals, ...rightAnalysis.unitLiterals],
    };
  }

  if (node.type === "parenthesized_expression") {
    const expression = node.childForFieldName("expression");
    if (!expression) {
      throw new Error("Unable to locate the parenthesized expression field");
    }

    const analysis = analyzeExpression(expression);
    return {
      document: concat([text("("), analysis.document, text(")")]),
      binaryOperators: analysis.binaryOperators,
      unitLiterals: analysis.unitLiterals,
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
        ...leadingComments.flatMap((comment) => [commentDocument(comment), hardLine]),
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
        previousDeclaration.document = concat([
          previousDeclaration.document,
          text(" "),
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
        document: concat([
          text(`${qualifier ? "pure " : ""}val ${declarationName.text}${typeAnnotation} = `),
          expression.document,
        ]),
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
          ? !openParen && !closeParen
          : Boolean(openParen) &&
            Boolean(closeParen) &&
            parameterCommas.length === parameters.length - 1 &&
            parameterNames.every(
              (parameterName) =>
                parameterName?.type === "identifier" || parameterName?.type === "hole",
            ) &&
            (parametersAreUntyped || parametersAreTyped);
      const hasSupportedReturnType = returnType
        ? canFormatType(returnType) && Boolean(returnColon) && parametersAreTyped
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
        parameterNames.length > 0
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
        document: concat([
          text(
            `${definitionHead} ${declarationName.text}${parameterList}${returnTypeAnnotation} = `,
          ),
          expression.document,
        ]),
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
      const variants = isMultilineSumType
        ? value.namedChildren.filter((child) => child.type === "sum_type_variant")
        : [];
      const aliasDocument = isMultilineSumType
        ? concat([
            text(`type ${declarationName.text}${typeParameterList} =`),
            indent(
              concat(
                variants.flatMap((variant) => [hardLine, text(`| ${formatSumVariant(variant)}`)]),
              ),
            ),
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

  if (pendingComments.length > 0 && declarations.length > 0) {
    throw new Error("Formatting trailing comments is not implemented yet");
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

  if (modules.length === 0 || pendingComments.length > 0) {
    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  return { hashbang, modules };
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
    const firstField = fields[0];
    const lastField = fields.at(-1);
    if (!openBrace || !closeBrace || !firstField || !lastField) {
      throw new Error("Unable to locate the record type delimiters");
    }

    const afterOpenBrace = source.slice(openBrace.endIndex, firstField.startIndex);
    if (afterOpenBrace !== " ") {
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

    if (row) {
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
    if (beforeCloseBrace !== " ") {
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
        if (commentGap !== " ") {
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
        if (
          previousDeclaration &&
          declarationStart.startPosition.row - previousDeclaration.node.endPosition.row !== 2
        ) {
          const row = declaration.node.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.keyword.startPosition.column + 1,
            length: declaration.keyword.text.length,
            rule: "format/definition-spacing",
            message: "expected one blank line between definitions",
            sourceLine: lines[row] ?? "",
          });
        }

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
        const hasCanonicalAfterEquals = isMultilineSum
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
            message: "expected one space around '='",
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
        if (beforeOperator !== " " || afterOperator !== " ") {
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
  const declarations = module.declarations.flatMap(({ document }, index) =>
    index === 0 ? [hardLine, document] : [hardLine, hardLine, document],
  );
  const danglingComments = module.danglingComments.flatMap((comment) => [
    hardLine,
    commentDocument(comment),
  ]);
  const body = [...declarations, ...danglingComments];
  return renderDoc(
    concat([text(`module ${module.name} {`), indent(concat(body)), hardLine, text("}"), hardLine]),
  );
}

function renderSource(source: ReturnType<typeof analyzeSource>): string {
  const hashbang = source.hashbang ? `${source.hashbang.text}\n` : "";
  const modules = source.modules.map((module) => {
    const leadingComments = renderDoc(
      concat(module.leadingComments.flatMap((comment) => [commentDocument(comment), hardLine])),
    );
    return `${leadingComments}${renderModule(module)}`;
  });
  return `${hashbang}${modules.join("\n")}`;
}

export function renderDiagnostic(diagnostic: FormatDiagnostic): string {
  const lineNumber = String(diagnostic.line);
  const gutter = " ".repeat(lineNumber.length);
  const underline = `${" ".repeat(diagnostic.column - 1)}${"^".repeat(diagnostic.length)}`;

  return [
    `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}: error[${diagnostic.rule}]: ${diagnostic.message}`,
    `${gutter} |`,
    `${lineNumber} |${diagnostic.sourceLine.length > 0 ? ` ${diagnostic.sourceLine}` : ""}`,
    `${gutter} | ${underline}`,
    `${gutter} |`,
    "",
  ].join("\n");
}
