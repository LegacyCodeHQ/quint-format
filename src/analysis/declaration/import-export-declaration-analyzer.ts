import type Parser from "tree-sitter";
import type { ModuleDeclaration } from "../../analysis.js";
import { text } from "../../document.js";
import { formatPattern } from "../../pattern-formatter.js";

const importExportDeclarationTypes = new Set([
  "module_import_declaration",
  "module_export_declaration",
  "named_import_declaration",
  "named_export_declaration",
  "wildcard_import_declaration",
  "wildcard_export_declaration",
]);

export function analyzeImportExportDeclaration(
  node: Parser.SyntaxNode,
): ModuleDeclaration | undefined {
  if (!importExportDeclarationTypes.has(node.type)) return undefined;

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

  return {
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
  };
}
