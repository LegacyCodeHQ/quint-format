import type Parser from "tree-sitter";
import type { AnalyzedModule } from "@/core/analysis.js";
import { analyzeAssumptionDeclaration } from "./declaration/assumption-declaration-analyzer.js";
import { analyzeImportExportDeclaration } from "./declaration/import-export-declaration-analyzer.js";
import { analyzeModuleInstance } from "./declaration/module-instance-analyzer.js";
import { analyzeOperatorDefinition } from "./declaration/operator-definition-analyzer.js";
import { analyzeTypeDeclaration } from "./declaration/type-declaration-analyzer.js";
import { analyzeValueDefinition } from "./declaration/value-definition-analyzer.js";
import { analyzeVariableDeclaration } from "./declaration/variable-declaration-analyzer.js";
import { ModuleDeclarationCollector } from "./module-declaration-collector.js";

export function analyzeModuleNode(moduleNode: Parser.SyntaxNode): AnalyzedModule {
  const nameNode = moduleNode.childForFieldName("name");

  if (moduleNode.type !== "module_definition" || nameNode?.type !== "identifier") {
    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

  const collector = new ModuleDeclarationCollector(moduleNode);

  for (const node of moduleNode.namedChildren) {
    if (node.id === nameNode.id) {
      continue;
    }

    if (collector.consumeComment(node)) continue;

    const assumptionDeclaration = analyzeAssumptionDeclaration(node);
    if (assumptionDeclaration) {
      collector.add(assumptionDeclaration);
      continue;
    }

    const valueDefinition = analyzeValueDefinition(node);
    if (valueDefinition) {
      collector.add(valueDefinition);
      continue;
    }

    const operatorDefinition = analyzeOperatorDefinition(node);
    if (operatorDefinition) {
      collector.add(operatorDefinition);
      continue;
    }

    const typeDeclaration = analyzeTypeDeclaration(node);
    if (typeDeclaration) {
      collector.add(typeDeclaration);
      continue;
    }

    const moduleInstance = analyzeModuleInstance(node);
    if (moduleInstance) {
      collector.add(moduleInstance);
      continue;
    }
    const importExportDeclaration = analyzeImportExportDeclaration(node);
    if (importExportDeclaration) {
      collector.add(importExportDeclaration);
      continue;
    }

    const variableDeclaration = analyzeVariableDeclaration(node);
    if (variableDeclaration) {
      collector.add(variableDeclaration);
      continue;
    }

    throw new Error("Formatting this Quint syntax is not implemented yet");
  }

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
    declarations: collector.declarations,
    danglingComments: collector.danglingComments,
  };
}
