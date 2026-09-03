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
  openParen?: Parser.SyntaxNode;
  closeParen?: Parser.SyntaxNode;
  parameters?: Parser.SyntaxNode[];
  equals?: Parser.SyntaxNode;
  valueNode?: Parser.SyntaxNode;
  binaryOperators?: BinaryOperator[];
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
    return { document: text(node.text), binaryOperators: [] };
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
      const typeAnnotation = declarationType ? `: ${declarationType.text}` : "";
      addDeclaration({
        node,
        qualifier: qualifier ?? undefined,
        keyword,
        nameNode: declarationName,
        colon: colon ?? undefined,
        typeNode: declarationType ?? undefined,
        equals,
        valueNode: value,
        binaryOperators: expression.binaryOperators,
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
      const body = node.childForFieldName("body");
      const equals = node.children.find((child) => child.type === "=");
      const hasUnsupportedHeader = node.children.some(
        (child) => child.type === ":" || child.type === ";",
      );
      const parameterName = parameters[0]?.childForFieldName("name");
      const hasSupportedParameters =
        parameters.length === 0
          ? !openParen && !closeParen
          : parameters.length === 1 &&
            Boolean(openParen) &&
            Boolean(closeParen) &&
            parameterName?.type === "identifier" &&
            !parameters[0]?.childForFieldName("type");
      if (
        !keyword ||
        !declarationName ||
        !equals ||
        !body ||
        hasUnsupportedHeader ||
        !hasSupportedParameters ||
        (!isPureDefinition && !isStandaloneDefinition)
      ) {
        throw new Error("Formatting this operator definition syntax is not implemented yet");
      }

      const expression = analyzeExpression(body);
      const definitionHead = isStandaloneDefinition
        ? qualifier.text
        : `${qualifier ? `${qualifier.text} ` : ""}def`;
      const parameterList = parameterName ? `(${parameterName.text})` : "";
      addDeclaration({
        node,
        qualifier: isPureDefinition ? (qualifier ?? undefined) : undefined,
        keyword,
        nameNode: declarationName,
        openParen,
        closeParen,
        parameters,
        equals,
        valueNode: body,
        binaryOperators: expression.binaryOperators,
        document: concat([
          text(`${definitionHead} ${declarationName.text}${parameterList} = `),
          expression.document,
        ]),
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
      document: text(`${keywordType} ${declarationName.text}: ${declarationType.text}`),
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

      if (declaration.colon && declaration.typeNode) {
        const colonGap = source.slice(declaration.nameNode.endIndex, declaration.colon.startIndex);
        if (colonGap.length > 0) {
          const row = declaration.nameNode.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: declaration.nameNode.endPosition.column + 1,
            length: Math.max(
              1,
              declaration.colon.startPosition.column - declaration.nameNode.endPosition.column,
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

      if (declaration.openParen && declaration.closeParen && declaration.parameters?.length === 1) {
        const parameter = declaration.parameters[0];
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

        const afterOpenParen = source.slice(declaration.openParen.endIndex, parameter.startIndex);
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

        const beforeCloseParen = source.slice(
          parameter.endIndex,
          declaration.closeParen.startIndex,
        );
        if (beforeCloseParen !== "") {
          const row = declaration.closeParen.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: parameter.endPosition.column + 1,
            length: Math.max(1, beforeCloseParen.length),
            rule: "format/parameter-list-spacing",
            message: "expected no space before ')'",
            sourceLine: lines[row] ?? "",
          });
        }
      }

      if (declaration.equals && declaration.valueNode) {
        const equalsAnchor = declaration.typeNode ?? declaration.closeParen ?? declaration.nameNode;
        const beforeEquals = source.slice(equalsAnchor.endIndex, declaration.equals.startIndex);
        const afterEquals = source.slice(
          declaration.equals.endIndex,
          declaration.valueNode.startIndex,
        );
        if (beforeEquals !== " " || afterEquals !== " ") {
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

  return diagnostics;
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
