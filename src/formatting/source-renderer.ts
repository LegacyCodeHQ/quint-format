import type { AnalyzedModule, AnalyzedSource } from "../analysis.js";
import { commentDocument, leadingCommentsDocument } from "./comments.js";
import { concat, hardLine, indent, renderDoc, text } from "./document.js";

function renderModule(module: AnalyzedModule): string {
  const declarations = module.declarations.flatMap((declaration, index, allDeclarations) => {
    if (index === 0) {
      const firstContent = declaration.leadingComments?.[0] ?? declaration.node;
      const lineBreaks = Math.min(
        2,
        Math.max(1, firstContent.startPosition.row - module.openBrace.endPosition.row),
      );
      return [...Array.from({ length: lineBreaks }, () => hardLine), declaration.document];
    }
    const previous = allDeclarations[index - 1];
    if (!previous) return [hardLine, declaration.document];
    const previousEnd = previous.trailingComments?.at(-1) ?? previous.node;
    const declarationStart = declaration.leadingComments?.[0] ?? declaration.node;
    const groupsCommentedImports =
      previous.keyword.text === "import" && declaration.keyword.text === "import";
    const separatesCommentedDeclaration = Boolean(
      declaration.leadingComments?.length && !groupsCommentedImports,
    );
    const lineBreaks = separatesCommentedDeclaration
      ? 2
      : Math.max(1, declarationStart.startPosition.row - previousEnd.endPosition.row);
    return [...Array.from({ length: lineBreaks }, () => hardLine), declaration.document];
  });
  const danglingComments = module.danglingComments.flatMap((comment, index, allComments) => {
    const lastDeclaration = module.declarations.at(-1);
    const previous =
      index === 0
        ? (lastDeclaration?.trailingComments?.at(-1) ?? lastDeclaration?.node ?? module.openBrace)
        : allComments[index - 1];
    const lineBreaks = Math.min(
      2,
      Math.max(1, comment.startPosition.row - (previous?.endPosition.row ?? 0)),
    );
    return [...Array.from({ length: lineBreaks }, () => hardLine), commentDocument(comment)];
  });
  const body = [...declarations, ...danglingComments];
  return renderDoc(
    concat([text(`module ${module.name} {`), indent(concat(body)), hardLine, text("}"), hardLine]),
  );
}

export function renderSource(source: AnalyzedSource): string {
  const hashbang = source.hashbang ? `${source.hashbang.text}\n` : "";
  const modules = source.modules.map((module) => {
    const leadingComments = renderDoc(leadingCommentsDocument(module.leadingComments, module.node));
    return `${leadingComments}${renderModule(module)}`;
  });
  const renderedModules = modules.join("\n");
  const trailingComments = source.trailingComments
    .map((comment) => renderDoc(commentDocument(comment)))
    .join("\n\n");
  return trailingComments
    ? `${hashbang}${renderedModules}\n${trailingComments}\n`
    : `${hashbang}${renderedModules}`;
}
