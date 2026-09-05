import type Parser from "tree-sitter";
import type { ModuleDeclaration } from "./analysis.js";
import { text } from "./document.js";
import { formatType } from "./type-formatter.js";

export function analyzeVariableDeclaration(node: Parser.SyntaxNode): ModuleDeclaration | undefined {
  const keywordType =
    node.type === "variable_declaration"
      ? "var"
      : node.type === "constant_declaration"
        ? "const"
        : undefined;
  if (!keywordType) return undefined;

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

  return {
    node,
    keyword,
    nameNode: declarationName,
    colon,
    typeNode: declarationType,
    typeRoots: [declarationType],
    document: text(
      `${keywordType} ${declarationName.text}:${typeGap}${formatType(declarationType)}`,
    ),
  };
}
