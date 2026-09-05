import type Parser from "tree-sitter";
import type { TypeCheckContext } from "./type-check-context.js";

export function checkSumType(node: Parser.SyntaxNode, context: TypeCheckContext): boolean {
  if (node.type !== "sum_type") return false;

  const { source, lines, filePath, diagnostics } = context;
  const variants = node.namedChildren.filter((child) => child.type === "sum_type_variant");
  const pipes = node.children.filter((child) => child.type === "|");
  const isMultiline = node.startPosition.row < node.endPosition.row;
  if (isMultiline) {
    for (const variant of variants) {
      const pipe = pipes.find(
        (candidate) =>
          candidate.startPosition.row === variant.startPosition.row &&
          candidate.endIndex <= variant.startIndex,
      );
      if (!pipe) {
        throw new Error("Unable to locate the multiline sum variant separator");
      }
      if (pipe.startPosition.column !== 4) {
        const row = pipe.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: 1,
          length: Math.max(1, pipe.startPosition.column),
          rule: "format/sum-variant-indentation",
          message: "expected 4 spaces of indentation",
          sourceLine: lines[row] ?? "",
        });
      }
      const afterPipe = source.slice(pipe.endIndex, variant.startIndex);
      if (afterPipe !== " ") {
        const row = pipe.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: pipe.startPosition.column + 1,
          length: 1,
          rule: "format/type-separator-spacing",
          message: "expected one space after '|'",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  } else {
    for (const pipe of pipes) {
      const previousVariant = [...variants]
        .reverse()
        .find((variant) => variant.endIndex <= pipe.startIndex);
      const nextVariant = variants.find((variant) => variant.startIndex >= pipe.endIndex);
      if (!previousVariant || !nextVariant) continue;

      const beforePipe = source.slice(previousVariant.endIndex, pipe.startIndex);
      const afterPipe = source.slice(pipe.endIndex, nextVariant.startIndex);
      if (beforePipe !== " " || afterPipe !== " ") {
        const row = pipe.startPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: pipe.startPosition.column + 1,
          length: 1,
          rule: "format/type-separator-spacing",
          message: "expected one space around '|'",
          sourceLine: lines[row] ?? "",
        });
      }
    }
  }

  for (const variant of variants) {
    const payload = variant.childForFieldName("payload");
    if (!payload) continue;

    const openParen = variant.children.find((child) => child.type === "(");
    const closeParen = variant.children.find((child) => child.type === ")");
    if (!openParen || !closeParen) {
      throw new Error("Unable to locate the sum variant payload delimiters");
    }
    const afterOpenParen = source.slice(openParen.endIndex, payload.startIndex);
    if (afterOpenParen !== "") {
      const row = openParen.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openParen.endPosition.column + 1,
        length: Math.max(1, afterOpenParen.length),
        rule: "format/type-delimiter-spacing",
        message: "expected no space after '('",
        sourceLine: lines[row] ?? "",
      });
    }
    const beforeCloseParen = source.slice(payload.endIndex, closeParen.startIndex);
    if (beforeCloseParen !== "") {
      const row = closeParen.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: payload.endPosition.column + 1,
        length: Math.max(1, beforeCloseParen.length),
        rule: "format/type-delimiter-spacing",
        message: "expected no space before ')'",
        sourceLine: lines[row] ?? "",
      });
    }
    context.check(payload);
  }
  return true;
}
