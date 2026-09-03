import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";

const parser = new Parser();
parser.setLanguage(Quint);

export function formatQuint(source: string): string {
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

  return `module ${nameNode.text} {\n}\n`;
}
