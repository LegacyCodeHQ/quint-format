import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { concat, hardLine, renderDoc, text } from "./document";

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

function analyzeEmptyModule(source: string) {
  const root = parseQuint(source);

  const moduleNode = root.namedChild(0);
  const nameNode = moduleNode?.childForFieldName("name");
  const isEmptyModule =
    root.namedChildCount === 1 &&
    moduleNode?.type === "module_definition" &&
    moduleNode.namedChildCount === 1 &&
    nameNode?.type === "identifier";

  if (!isEmptyModule) {
    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  const openBrace = moduleNode.children.find((child) => child.type === "{");
  const closeBrace = moduleNode.children.find((child) => child.type === "}");
  const moduleKeyword = moduleNode.children.find((child) => child.type === "module");

  if (!openBrace || !closeBrace || !moduleKeyword) {
    throw new Error("Unable to locate the empty module tokens");
  }

  return { name: nameNode.text, nameNode, moduleKeyword, openBrace, closeBrace };
}

export function formatQuint(source: string): string {
  const module = analyzeEmptyModule(source);
  return renderEmptyModule(module.name);
}

export function checkQuint(source: string, filePath: string): FormatDiagnostic[] {
  const module = analyzeEmptyModule(source);
  const formatted = renderEmptyModule(module.name);
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

  if (module.openBrace.startPosition.row === module.closeBrace.startPosition.row) {
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

  return diagnostics;
}

function renderEmptyModule(name: string): string {
  return renderDoc(concat([text(`module ${name} {`), hardLine, text("}"), hardLine]));
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
