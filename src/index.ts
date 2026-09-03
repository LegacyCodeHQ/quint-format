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
  keyword: Parser.SyntaxNode;
  nameNode: Parser.SyntaxNode;
  colon?: Parser.SyntaxNode;
  typeNode?: Parser.SyntaxNode;
  equals?: Parser.SyntaxNode;
  valueNode?: Parser.SyntaxNode;
  binaryOperators?: BinaryOperator[];
  document: Doc;
}

interface BinaryOperator {
  node: Parser.SyntaxNode;
  left: Parser.SyntaxNode;
  right: Parser.SyntaxNode;
}

interface ExpressionAnalysis {
  document: Doc;
  binaryOperators: BinaryOperator[];
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
    const operator = node.children.find((child) => child.type === "+");
    if (!left || !right || !operator) {
      throw new Error("Formatting this binary expression syntax is not implemented yet");
    }

    const leftAnalysis = analyzeExpression(left);
    const rightAnalysis = analyzeExpression(right);
    return {
      document: concat([leftAnalysis.document, text(" + "), rightAnalysis.document]),
      binaryOperators: [
        ...leftAnalysis.binaryOperators,
        { node: operator, left, right },
        ...rightAnalysis.binaryOperators,
      ],
    };
  }

  throw new Error("Formatting this expression syntax is not implemented yet");
}

function analyzeModule(source: string) {
  const root = parseQuint(source);

  const moduleNode = root.namedChild(0);
  const nameNode = moduleNode?.childForFieldName("name");
  const isModule =
    root.namedChildCount === 1 &&
    moduleNode?.type === "module_definition" &&
    nameNode?.type === "identifier";

  if (!isModule) {
    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  const declarations: ModuleDeclaration[] = [];
  for (const node of moduleNode.namedChildren) {
    if (node.id === nameNode.id) {
      continue;
    }

    if (node.type === "assumption_declaration") {
      const keyword = node.children.find((child) => child.type === "assume");
      const declarationName = node.childForFieldName("name");
      const condition = node.childForFieldName("condition");
      const equals = node.children.find((child) => child.type === "=");
      if (!keyword || !declarationName || !equals || condition?.type !== "boolean_literal") {
        throw new Error("Formatting this assumption syntax is not implemented yet");
      }

      declarations.push({
        node,
        keyword,
        nameNode: declarationName,
        equals,
        valueNode: condition,
        document: text(`assume ${declarationName.text} = ${condition.text}`),
      });
      continue;
    }

    if (node.type === "value_definition") {
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
        Boolean(declarationType) !== Boolean(colon)
      ) {
        throw new Error("Formatting this value definition syntax is not implemented yet");
      }

      const expression = analyzeExpression(value);
      const typeAnnotation = declarationType ? `: ${declarationType.text}` : "";
      declarations.push({
        node,
        keyword,
        nameNode: declarationName,
        colon: colon ?? undefined,
        typeNode: declarationType ?? undefined,
        equals,
        valueNode: value,
        binaryOperators: expression.binaryOperators,
        document: concat([
          text(`val ${declarationName.text}${typeAnnotation} = `),
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

    declarations.push({
      node,
      keyword,
      nameNode: declarationName,
      colon,
      typeNode: declarationType,
      document: text(`${keywordType} ${declarationName.text}: ${declarationType.text}`),
    });
  }

  const openBrace = moduleNode.children.find((child) => child.type === "{");
  const closeBrace = moduleNode.children.find((child) => child.type === "}");
  const moduleKeyword = moduleNode.children.find((child) => child.type === "module");

  if (!openBrace || !closeBrace || !moduleKeyword) {
    throw new Error("Unable to locate the empty module tokens");
  }

  return { name: nameNode.text, nameNode, moduleKeyword, openBrace, closeBrace, declarations };
}

export function formatQuint(source: string): string {
  return renderModule(analyzeModule(source));
}

export function checkQuint(source: string, filePath: string): FormatDiagnostic[] {
  const module = analyzeModule(source);
  const formatted = renderModule(module);
  const diagnostics: FormatDiagnostic[] = [];

  if (source === formatted) {
    return [];
  }

  const lines = source.split(/\r?\n/);
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

  for (const [index, declaration] of module.declarations.entries()) {
    const previousDeclaration = index > 0 ? module.declarations[index - 1] : undefined;
    const sharesLineWithPrevious =
      previousDeclaration?.node.endPosition.row === declaration.node.startPosition.row;

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
    } else if (declaration.node.startPosition.column !== 2) {
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

    const keywordGap = source.slice(declaration.keyword.endIndex, declaration.nameNode.startIndex);
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

    if (declaration.equals && declaration.valueNode) {
      const equalsAnchor = declaration.typeNode ?? declaration.nameNode;
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
      const beforeOperator = source.slice(operator.left.endIndex, operator.node.startIndex);
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

function renderModule(module: ReturnType<typeof analyzeModule>): string {
  const body = module.declarations.flatMap(({ document }) => [hardLine, document]);
  return renderDoc(
    concat([text(`module ${module.name} {`), indent(concat(body)), hardLine, text("}"), hardLine]),
  );
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
