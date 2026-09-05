import type Parser from "tree-sitter";
import type { ExpressionAnalysis, ModuleDeclaration } from "./analysis.js";
import { commentDocument } from "./comments.js";
import { concat, type Doc, hardLine, indent, text } from "./document.js";
import { analyzeExpression } from "./expression-analyzer.js";
import { formatPattern } from "./pattern-formatter.js";

interface OverrideAnalysis {
  node: Parser.SyntaxNode;
  name: Parser.SyntaxNode;
  value: ExpressionAnalysis;
}

export function analyzeModuleInstance(node: Parser.SyntaxNode): ModuleDeclaration | undefined {
  const isAnonymous = node.type === "anonymous_instance_declaration";
  if (!isAnonymous && node.type !== "instance_declaration") return undefined;

  const keyword = node.children.find((child) => child.type === "import");
  const importedModule = node.childForFieldName("module");
  const openParen = node.children.find((child) => child.type === "(");
  const closeParen = node.children.find((child) => child.type === ")");
  const overrides = node.namedChildren.filter((child) => child.type === "instance_override");
  const commas = node.children.filter((child) => child.type === ",");
  const sourceNode = node.childForFieldName("source");
  const fromKeyword = node.children.find((child) => child.type === "from");
  const alias = isAnonymous ? null : node.childForFieldName("alias");
  const asKeyword = isAnonymous ? undefined : node.children.find((child) => child.type === "as");
  const dot = isAnonymous ? node.children.find((child) => child.type === ".") : undefined;
  const star = isAnonymous ? node.children.find((child) => child.type === "*") : undefined;
  const hasInvalidSharedFields =
    !keyword ||
    !importedModule ||
    !openParen ||
    !closeParen ||
    Boolean(sourceNode) !== Boolean(fromKeyword);
  const hasInvalidVariantFields = isAnonymous
    ? !dot || !star
    : Boolean(alias) !== Boolean(asKeyword);
  if (hasInvalidSharedFields || hasInvalidVariantFields) {
    throw new Error(
      isAnonymous
        ? "Unable to locate the anonymous instance declaration"
        : "Unable to locate the module instance declaration",
    );
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
  const overrideDocuments = hasComments
    ? buildOverrideDocuments(
        node,
        importedModule,
        alias,
        sourceNode,
        overrideAnalyses,
        commas,
        isAnonymous,
      )
    : [];
  const suffix = isAnonymous
    ? `).*${sourceNode ? ` from ${sourceNode.text}` : ""}`
    : `)${alias ? ` as ${formatPattern(alias)}` : ""}${sourceNode ? ` from ${sourceNode.text}` : ""}`;
  const document = hasComments
    ? concat([
        text(`import ${formatPattern(importedModule)}(`),
        indent(concat(overrideDocuments.flatMap((entry) => [hardLine, entry]))),
        hardLine,
        text(suffix),
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
          text(suffix),
        ])
      : concat([
          text(`import ${formatPattern(importedModule)}(`),
          ...overrideAnalyses.flatMap(({ name, value }, index) => [
            ...(index === 0 ? [] : [text(", ")]),
            text(`${formatPattern(name)} = `),
            value.document,
          ]),
          text(suffix),
        ]);
  const common = {
    node,
    keyword,
    nameNode: importedModule,
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
    document,
  };

  return isAnonymous
    ? { ...common, dot, selectorNode: star }
    : { ...common, aliasNode: alias ?? undefined, asKeyword };
}

function buildOverrideDocuments(
  node: Parser.SyntaxNode,
  importedModule: Parser.SyntaxNode,
  alias: Parser.SyntaxNode | null,
  sourceNode: Parser.SyntaxNode | null,
  overrideAnalyses: OverrideAnalysis[],
  commas: Parser.SyntaxNode[],
  isAnonymous: boolean,
): Doc[] {
  const documents: Doc[] = [];
  let previousOverride: OverrideAnalysis | undefined;
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
        const previousDocument = documents.pop();
        if (!previousDocument) {
          throw new Error(
            isAnonymous
              ? "Unable to attach the trailing anonymous override comment"
              : "Unable to attach the trailing instance override comment",
          );
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
        documents.push(concat([previousDocument, text(commentGap), commentDocument(child)]));
      } else {
        documents.push(commentDocument(child));
      }
      previousOverride = undefined;
      continue;
    }
    const index = overrideAnalyses.findIndex((override) => override.node.id === child.id);
    const override = overrideAnalyses[index];
    if (!override) {
      throw new Error(
        isAnonymous
          ? "Formatting this anonymous override content is not implemented yet"
          : "Formatting this instance override content is not implemented yet",
      );
    }
    documents.push(
      concat([
        text(`${formatPattern(override.name)} = `),
        override.value.document,
        ...(index < overrideAnalyses.length - 1 ? [text(",")] : []),
      ]),
    );
    previousOverride = override;
  }
  return documents;
}
