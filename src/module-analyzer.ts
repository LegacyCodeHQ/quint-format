import type Parser from "tree-sitter";
import type { AnalyzedModule, ModuleDeclaration } from "./analysis.js";
import { analyzeAssumptionDeclaration } from "./assumption-declaration-analyzer.js";
import {
  commentDocument,
  leadingCommentsDocument,
  preservesTrailingCommentAlignment,
} from "./comments.js";
import { concat, type Doc, hardLine, indent, text } from "./document.js";
import { analyzeExpression } from "./expression-analyzer.js";
import { analyzeOperatorDefinition } from "./operator-definition-analyzer.js";
import { formatPattern } from "./pattern-formatter.js";
import { analyzeTypeDeclaration } from "./type-declaration-analyzer.js";
import { formatType } from "./type-formatter.js";
import { analyzeValueDefinition } from "./value-definition-analyzer.js";

export function analyzeModuleNode(moduleNode: Parser.SyntaxNode): AnalyzedModule {
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
        leadingCommentsDocument(leadingComments, declaration.node),
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
      const previousTrailingComment = previousDeclaration?.trailingComments?.at(-1);
      const continuesTrailingComment = Boolean(
        previousTrailingComment &&
          node.startPosition.row === previousTrailingComment.endPosition.row + 1 &&
          node.startPosition.column === previousTrailingComment.startPosition.column,
      );
      const startsIndentedTrailingComment = Boolean(
        previousDeclaration &&
          !previousTrailingComment &&
          node.startPosition.row === previousDeclaration.node.endPosition.row + 1 &&
          node.startPosition.column > previousDeclaration.node.startPosition.column,
      );
      if (
        previousDeclaration &&
        pendingComments.length === 0 &&
        (node.startPosition.row === previousDeclaration.node.endPosition.row ||
          continuesTrailingComment ||
          startsIndentedTrailingComment)
      ) {
        previousDeclaration.trailingComments = [
          ...(previousDeclaration.trailingComments ?? []),
          node,
        ];
        if (continuesTrailingComment || startsIndentedTrailingComment) {
          previousDeclaration.document = concat([
            previousDeclaration.document,
            hardLine,
            text(
              " ".repeat(
                Math.max(
                  0,
                  node.startPosition.column - previousDeclaration.node.startPosition.column,
                ),
              ),
            ),
            commentDocument(node),
          ]);
          continue;
        }
        const sourceCommentGap = moduleNode.text.slice(
          previousDeclaration.node.endIndex - moduleNode.startIndex,
          node.startIndex - moduleNode.startIndex,
        );
        const preservesAlignment =
          previousDeclaration.valueNode?.type === "sum_type" ||
          preservesTrailingCommentAlignment(sourceCommentGap);
        const commentGap = preservesAlignment ? sourceCommentGap : " ";
        previousDeclaration.document = concat([
          previousDeclaration.document,
          text(commentGap),
          commentDocument(node),
        ]);
        continue;
      }
    }

    if (node.type === "documentation_comment" || node.type === "comment") {
      pendingComments.push(node);
      continue;
    }

    const assumptionDeclaration = analyzeAssumptionDeclaration(node);
    if (assumptionDeclaration) {
      addDeclaration(assumptionDeclaration);
      continue;
    }

    const valueDefinition = analyzeValueDefinition(node);
    if (valueDefinition) {
      addDeclaration(valueDefinition);
      continue;
    }

    const operatorDefinition = analyzeOperatorDefinition(node);
    if (operatorDefinition) {
      addDeclaration(operatorDefinition);
      continue;
    }

    const typeDeclaration = analyzeTypeDeclaration(node);
    if (typeDeclaration) {
      addDeclaration(typeDeclaration);
      continue;
    }

    if (node.type === "instance_declaration") {
      const keyword = node.children.find((child) => child.type === "import");
      const importedModule = node.childForFieldName("module");
      const openParen = node.children.find((child) => child.type === "(");
      const closeParen = node.children.find((child) => child.type === ")");
      const overrides = node.namedChildren.filter((child) => child.type === "instance_override");
      const commas = node.children.filter((child) => child.type === ",");
      const alias = node.childForFieldName("alias");
      const asKeyword = node.children.find((child) => child.type === "as");
      const sourceNode = node.childForFieldName("source");
      const fromKeyword = node.children.find((child) => child.type === "from");
      if (
        !keyword ||
        !importedModule ||
        !openParen ||
        !closeParen ||
        Boolean(alias) !== Boolean(asKeyword) ||
        Boolean(sourceNode) !== Boolean(fromKeyword)
      ) {
        throw new Error("Unable to locate the module instance declaration");
      }
      const overrideAnalyses = overrides.map((override) => {
        const overrideName = override.childForFieldName("name");
        const value = override.childForFieldName("value");
        if (!overrideName || !value) throw new Error("Unable to locate the instance override");
        return { node: override, name: overrideName, value: analyzeExpression(value) };
      });
      const hasComments = node.namedChildren.some(
        (child) => child.type === "comment" || child.type === "documentation_comment",
      );
      const firstOverride = overrides[0];
      const lastOverride = overrides.at(-1);
      const isExpandedInstance = Boolean(
        firstOverride &&
          lastOverride &&
          firstOverride.startPosition.row > openParen.endPosition.row &&
          closeParen.startPosition.row > lastOverride.endPosition.row,
      );
      const overrideDocuments: Doc[] = [];
      if (hasComments) {
        let previousOverride: (typeof overrideAnalyses)[number] | undefined;
        for (const child of node.namedChildren.filter(
          (candidate) =>
            candidate.id !== importedModule.id &&
            candidate.id !== alias?.id &&
            candidate.id !== sourceNode?.id,
        )) {
          if (child.type === "comment" || child.type === "documentation_comment") {
            const isTrailingOverrideComment =
              previousOverride?.node.endPosition.row === child.startPosition.row;
            if (isTrailingOverrideComment && previousOverride) {
              const previousDocument = overrideDocuments.pop();
              if (!previousDocument) {
                throw new Error("Unable to attach the trailing instance override comment");
              }
              const previousIndex = overrideAnalyses.findIndex(
                (override) => override.node.id === previousOverride?.node.id,
              );
              const comma = commas[previousIndex];
              const commentAnchor =
                comma && comma.endIndex <= child.startIndex ? comma : previousOverride.node;
              const commentGap = node.text.slice(
                commentAnchor.endIndex - node.startIndex,
                child.startIndex - node.startIndex,
              );
              overrideDocuments.push(
                concat([previousDocument, text(commentGap), commentDocument(child)]),
              );
            } else {
              overrideDocuments.push(commentDocument(child));
            }
            previousOverride = undefined;
            continue;
          }
          const index = overrideAnalyses.findIndex((override) => override.node.id === child.id);
          const override = overrideAnalyses[index];
          if (!override) {
            throw new Error("Formatting this instance override content is not implemented yet");
          }
          overrideDocuments.push(
            concat([
              text(`${formatPattern(override.name)} = `),
              override.value.document,
              ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
            ]),
          );
          previousOverride = override;
        }
      }
      addDeclaration({
        node,
        keyword,
        nameNode: importedModule,
        aliasNode: alias ?? undefined,
        asKeyword,
        fromKeyword,
        sourceNode: sourceNode ?? undefined,
        instanceOpenParen: openParen,
        instanceCloseParen: closeParen,
        instanceOverrides: overrides,
        instanceCommas: commas,
        binaryOperators: overrideAnalyses.flatMap(({ value }) => value.binaryOperators),
        unitLiterals: overrideAnalyses.flatMap(({ value }) => value.unitLiterals),
        sequenceLiterals: overrideAnalyses.flatMap(({ value }) => value.sequenceLiterals),
        recordLiterals: overrideAnalyses.flatMap(({ value }) => value.recordLiterals),
        callExpressions: overrideAnalyses.flatMap(({ value }) => value.callExpressions),
        document: hasComments
          ? concat([
              text(`import ${formatPattern(importedModule)}(`),
              indent(concat(overrideDocuments.flatMap((document) => [hardLine, document]))),
              hardLine,
              text(
                `)${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`,
              ),
            ])
          : isExpandedInstance
            ? concat([
                text(`import ${formatPattern(importedModule)}(`),
                indent(
                  concat(
                    overrideAnalyses.flatMap(({ name, value }, index) => [
                      hardLine,
                      text(`${formatPattern(name)} = `),
                      value.document,
                      ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
                    ]),
                  ),
                ),
                hardLine,
                text(
                  `)${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`,
                ),
              ])
            : concat([
                text(`import ${formatPattern(importedModule)}(`),
                ...overrideAnalyses.flatMap(({ name, value }, index) => [
                  ...(index === 0 ? [] : [text(", ")]),
                  text(`${formatPattern(name)} = `),
                  value.document,
                ]),
                text(
                  `)${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`,
                ),
              ]),
      });
      continue;
    }

    if (node.type === "anonymous_instance_declaration") {
      const keyword = node.children.find((child) => child.type === "import");
      const importedModule = node.childForFieldName("module");
      const openParen = node.children.find((child) => child.type === "(");
      const closeParen = node.children.find((child) => child.type === ")");
      const dot = node.children.find((child) => child.type === ".");
      const star = node.children.find((child) => child.type === "*");
      const overrides = node.namedChildren.filter((child) => child.type === "instance_override");
      const commas = node.children.filter((child) => child.type === ",");
      const sourceNode = node.childForFieldName("source");
      const fromKeyword = node.children.find((child) => child.type === "from");
      if (
        !keyword ||
        !importedModule ||
        !openParen ||
        !closeParen ||
        !dot ||
        !star ||
        Boolean(sourceNode) !== Boolean(fromKeyword)
      ) {
        throw new Error("Unable to locate the anonymous instance declaration");
      }
      const overrideAnalyses = overrides.map((override) => {
        const overrideName = override.childForFieldName("name");
        const value = override.childForFieldName("value");
        if (!overrideName || !value) throw new Error("Unable to locate the instance override");
        return { node: override, name: overrideName, value: analyzeExpression(value) };
      });
      const hasComments = node.namedChildren.some(
        (child) => child.type === "comment" || child.type === "documentation_comment",
      );
      const firstOverride = overrides[0];
      const lastOverride = overrides.at(-1);
      const isExpandedInstance = Boolean(
        firstOverride &&
          lastOverride &&
          firstOverride.startPosition.row > openParen.endPosition.row &&
          closeParen.startPosition.row > lastOverride.endPosition.row,
      );
      const overrideDocuments: Doc[] = [];
      if (hasComments) {
        let previousOverride: (typeof overrideAnalyses)[number] | undefined;
        for (const child of node.namedChildren.filter(
          (candidate) => candidate.id !== importedModule.id && candidate.id !== sourceNode?.id,
        )) {
          if (child.type === "comment" || child.type === "documentation_comment") {
            const isTrailingOverrideComment =
              previousOverride?.node.endPosition.row === child.startPosition.row;
            if (isTrailingOverrideComment && previousOverride) {
              const previousDocument = overrideDocuments.pop();
              if (!previousDocument) {
                throw new Error("Unable to attach the trailing anonymous override comment");
              }
              const previousIndex = overrideAnalyses.findIndex(
                (override) => override.node.id === previousOverride?.node.id,
              );
              const comma = commas[previousIndex];
              const commentAnchor =
                comma && comma.endIndex <= child.startIndex ? comma : previousOverride.node;
              const commentGap = node.text.slice(
                commentAnchor.endIndex - node.startIndex,
                child.startIndex - node.startIndex,
              );
              overrideDocuments.push(
                concat([previousDocument, text(commentGap), commentDocument(child)]),
              );
            } else {
              overrideDocuments.push(commentDocument(child));
            }
            previousOverride = undefined;
            continue;
          }
          const index = overrideAnalyses.findIndex((override) => override.node.id === child.id);
          const override = overrideAnalyses[index];
          if (!override) {
            throw new Error("Formatting this anonymous override content is not implemented yet");
          }
          overrideDocuments.push(
            concat([
              text(`${formatPattern(override.name)} = `),
              override.value.document,
              ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
            ]),
          );
          previousOverride = override;
        }
      }
      addDeclaration({
        node,
        keyword,
        nameNode: importedModule,
        dot,
        selectorNode: star,
        fromKeyword,
        sourceNode: sourceNode ?? undefined,
        instanceOpenParen: openParen,
        instanceCloseParen: closeParen,
        instanceOverrides: overrides,
        instanceCommas: commas,
        binaryOperators: overrideAnalyses.flatMap(({ value }) => value.binaryOperators),
        unitLiterals: overrideAnalyses.flatMap(({ value }) => value.unitLiterals),
        sequenceLiterals: overrideAnalyses.flatMap(({ value }) => value.sequenceLiterals),
        recordLiterals: overrideAnalyses.flatMap(({ value }) => value.recordLiterals),
        callExpressions: overrideAnalyses.flatMap(({ value }) => value.callExpressions),
        document: hasComments
          ? concat([
              text(`import ${formatPattern(importedModule)}(`),
              indent(concat(overrideDocuments.flatMap((document) => [hardLine, document]))),
              hardLine,
              text(`).*${sourceNode ? ` from ${sourceNode.text}` : ""}`),
            ])
          : isExpandedInstance
            ? concat([
                text(`import ${formatPattern(importedModule)}(`),
                indent(
                  concat(
                    overrideAnalyses.flatMap(({ name, value }, index) => [
                      hardLine,
                      text(`${formatPattern(name)} = `),
                      value.document,
                      ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
                    ]),
                  ),
                ),
                hardLine,
                text(`).*${sourceNode ? ` from ${sourceNode.text}` : ""}`),
              ])
            : concat([
                text(`import ${formatPattern(importedModule)}(`),
                ...overrideAnalyses.flatMap(({ name, value }, index) => [
                  ...(index === 0 ? [] : [text(", ")]),
                  text(`${formatPattern(name)} = `),
                  value.document,
                ]),
                text(`).*${sourceNode ? ` from ${sourceNode.text}` : ""}`),
              ]),
      });
      continue;
    }

    if (
      node.type === "module_import_declaration" ||
      node.type === "module_export_declaration" ||
      node.type === "named_import_declaration" ||
      node.type === "named_export_declaration" ||
      node.type === "wildcard_import_declaration" ||
      node.type === "wildcard_export_declaration"
    ) {
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
      addDeclaration({
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
    const sourceTypeGap = node.text.slice(
      colon.endIndex - node.startIndex,
      declarationType.startIndex - node.startIndex,
    );
    const typeGap = /^ +$/u.test(sourceTypeGap) ? sourceTypeGap : " ";

    addDeclaration({
      node,
      keyword,
      nameNode: declarationName,
      colon,
      typeNode: declarationType,
      typeRoots: [declarationType],
      document: text(
        `${keywordType} ${declarationName.text}:${typeGap}${formatType(declarationType)}`,
      ),
    });
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
