import type { AnalyzedModule, AnalyzedSource } from "@/core/analysis.js";
import type { SourceLayoutIndex } from "@/parsing/source-layout.js";
import { commentDocument, leadingCommentsDocument } from "./comments.js";
import { planDeclarationBoundary } from "./declaration-spacing.js";
import { concat, hardLine, indent, renderDoc, text } from "./document.js";
import { maxPreservedLineBreaks } from "./policy.js";

function renderModule(module: AnalyzedModule, sourceLayout: SourceLayoutIndex): string {
  const declarations = module.declarations.flatMap((declaration, index, allDeclarations) => {
    if (index === 0) {
      const firstContent = declaration.leadingComments?.[0] ?? declaration.node;
      const lineBreaks = Math.min(
        maxPreservedLineBreaks,
        Math.max(1, sourceLayout.lineBreaksBetween(module.openBrace, firstContent)),
      );
      return [...Array.from({ length: lineBreaks }, () => hardLine), declaration.document];
    }
    const previous = allDeclarations[index - 1];
    if (!previous) return [hardLine, declaration.document];
    const plan = planDeclarationBoundary(previous, declaration, sourceLayout);
    return [
      ...Array.from({ length: plan.expectedLineBreaks }, () => hardLine),
      declaration.document,
    ];
  });
  const danglingComments = module.danglingComments.flatMap((comment, index, allComments) => {
    const lastDeclaration = module.declarations.at(-1);
    const previous =
      index === 0
        ? (lastDeclaration?.trailingComments?.at(-1) ?? lastDeclaration?.node ?? module.openBrace)
        : allComments[index - 1];
    const lineBreaks = Math.min(
      maxPreservedLineBreaks,
      Math.max(1, previous ? sourceLayout.lineBreaksBetween(previous, comment) : 1),
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
    return `${leadingComments}${renderModule(module, source.sourceLayout)}`;
  });
  const renderedModules = modules.join("\n");
  const trailingComments = source.trailingComments
    .map((comment) => renderDoc(commentDocument(comment)))
    .join("\n\n");
  return trailingComments
    ? `${hashbang}${renderedModules}\n${trailingComments}\n`
    : `${hashbang}${renderedModules}`;
}
