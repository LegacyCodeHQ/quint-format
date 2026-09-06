import type { ModuleDeclaration } from "@/core/analysis.js";

function isDefinition(declaration: ModuleDeclaration): boolean {
  const type = declaration.node.type;
  return type === "operator_definition" || type === "value_definition";
}

function isMultiline(declaration: ModuleDeclaration): boolean {
  return declaration.node.startPosition.row < declaration.node.endPosition.row;
}

export function separatesDefinitions(
  previous: ModuleDeclaration,
  current: ModuleDeclaration,
): boolean {
  if (!isDefinition(previous) || !isDefinition(current)) return false;

  return isMultiline(previous) && isMultiline(current);
}
