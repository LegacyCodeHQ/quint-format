import { describe, expect, test } from "bun:test";
import type Parser from "tree-sitter";
import { analyzeOperatorExpression } from "@/analysis/expression/operator-expression-analyzer.js";
import type { ExpressionAnalysis } from "@/core/analysis.js";
import { renderDoc, text } from "@/formatting/document.js";

const position = (column: number): Parser.Point => ({ row: 0, column });

function leaf(type: string, source: string, start: number): Parser.SyntaxNode {
  return {
    type,
    text: source,
    startIndex: start,
    endIndex: start + source.length,
    startPosition: position(start),
    endPosition: position(start + source.length),
    children: [],
    parent: null,
  } as unknown as Parser.SyntaxNode;
}

describe("pair expression analysis", () => {
  test("formats the named pair node through the infix pipeline", () => {
    const left = leaf("integer_literal", "1", 0);
    const arrow = leaf("->", "->", 2);
    const right = leaf("integer_literal", "2", 5);
    const fields: Record<string, Parser.SyntaxNode> = { left, right };
    const pair = {
      type: "pair_expression",
      text: "1 -> 2",
      startIndex: 0,
      endIndex: 6,
      startPosition: position(0),
      endPosition: position(6),
      children: [left, arrow, right],
      parent: null,
      childForFieldName: (name: string) => fields[name] ?? null,
    } as unknown as Parser.SyntaxNode;
    const analyzeLeaf = (node: Parser.SyntaxNode): ExpressionAnalysis => ({
      document: text(node.text),
      binaryOperators: [],
      unitLiterals: [],
      sequenceLiterals: [],
      recordLiterals: [],
      callExpressions: [],
    });

    const analysis = analyzeOperatorExpression(pair, analyzeLeaf);

    expect(analysis).toBeDefined();
    expect(renderDoc((analysis as ExpressionAnalysis).document)).toBe("1 -> 2");
    expect((analysis as ExpressionAnalysis).binaryOperators[0]?.node).toBe(arrow);
  });
});
