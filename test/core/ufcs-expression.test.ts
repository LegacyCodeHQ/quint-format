import { describe, expect, test } from "bun:test";
import type Parser from "tree-sitter";
import { analyzeCallExpression } from "@/analysis/expression/call-expression-analyzer.js";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { renderDoc, text } from "@/formatting/document.js";

const point = (column: number): Parser.Point => ({ row: 0, column });

function leaf(type: string, source: string, start: number): Parser.SyntaxNode {
  return {
    type,
    text: source,
    startIndex: start,
    endIndex: start + source.length,
    startPosition: point(start),
    endPosition: point(start + source.length),
    children: [],
    namedChildren: [],
    parent: null,
  } as unknown as Parser.SyntaxNode;
}

describe("UFCS expression analysis", () => {
  test("formats a named UFCS call from its receiver and method fields", () => {
    const receiver = leaf("integer_literal", "1", 0);
    const dot = leaf(".", ".", 1);
    const method = leaf("identifier", "to", 2);
    const open = leaf("(", "(", 4);
    const close = leaf(")", ")", 5);
    const fields: Record<string, Parser.SyntaxNode> = { receiver, method };
    const ufcs = {
      type: "ufcs_call_expression",
      text: "1.to()",
      startIndex: 0,
      endIndex: 6,
      startPosition: point(0),
      endPosition: point(6),
      children: [receiver, dot, method, open, close],
      namedChildren: [receiver, method],
      parent: null,
      childForFieldName: (name: string) => fields[name] ?? null,
      childrenForFieldName: () => [],
    } as unknown as Parser.SyntaxNode;
    const analyzeLeaf = (node: Parser.SyntaxNode): ExpressionAnalysis => ({
      document: text(node.text),
      binaryOperators: [],
      unitLiterals: [],
      sequenceLiterals: [],
      recordLiterals: [],
      callExpressions: [],
    });

    const analysis = analyzeCallExpression(ufcs, analyzeLeaf);

    expect(analysis).toBeDefined();
    expect(renderDoc((analysis as ExpressionAnalysis).document)).toBe("1.to()");
    expect((analysis as ExpressionAnalysis).callExpressions).toEqual([ufcs]);
  });
});
