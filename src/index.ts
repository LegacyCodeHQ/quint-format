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

function analyzeEmptyModule(source: string) {
  const root = parser.parse(source).rootNode;

  if (root.hasError) {
    throw new SyntaxError("Cannot format invalid Quint source");
  }

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

  if (!openBrace || !closeBrace) {
    throw new Error("Unable to locate the empty module braces");
  }

  return { name: nameNode.text, openBrace, closeBrace };
}

export function formatQuint(source: string): string {
  const module = analyzeEmptyModule(source);
  return renderEmptyModule(module.name);
}

export function checkQuint(source: string, filePath: string): FormatDiagnostic[] {
  const module = analyzeEmptyModule(source);
  const formatted = renderEmptyModule(module.name);

  if (
    source === formatted ||
    module.openBrace.startPosition.row !== module.closeBrace.startPosition.row
  ) {
    return [];
  }

  const row = module.openBrace.startPosition.row;

  return [
    {
      filePath,
      line: row + 1,
      column: module.openBrace.startPosition.column + 1,
      length: Math.max(
        1,
        module.closeBrace.endPosition.column - module.openBrace.startPosition.column,
      ),
      rule: "format/empty-module",
      message: "empty module braces must be on separate lines",
      sourceLine: source.split(/\r?\n/)[row] ?? "",
    },
  ];
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
    `${lineNumber} | ${diagnostic.sourceLine}`,
    `${gutter} | ${underline}`,
    `${gutter} |`,
    "",
  ].join("\n");
}
