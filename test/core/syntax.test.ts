import { describe, expect, test } from "bun:test";
import type Parser from "tree-sitter";
import {
  blockCombinatorEntries,
  definitionBody,
  isBlockCombinatorExpression,
} from "@/parsing/syntax.js";

function definitionNode(
  type: string,
  fields: Record<string, Parser.SyntaxNode>,
): Parser.SyntaxNode {
  return {
    type,
    childForFieldName: (name: string) => fields[name] ?? null,
  } as unknown as Parser.SyntaxNode;
}

describe("syntax helpers", () => {
  test("reads unified and legacy definition body fields", () => {
    const body = { id: 1 } as Parser.SyntaxNode;

    expect(definitionBody(definitionNode("value_definition", { body }))).toBe(body);
    expect(definitionBody(definitionNode("value_definition", { value: body }))).toBe(body);
    expect(definitionBody(definitionNode("operator_definition", { body }))).toBe(body);
    expect(definitionBody(definitionNode("record_literal_field", { value: body }))).toBeNull();
  });

  test("classifies block combinators and reads their legacy entry fields", () => {
    const entry = { id: 2 } as Parser.SyntaxNode;
    const combinator = {
      type: "any_expression",
      childrenForFieldName: (name: string) => (name === "choice" ? [entry] : []),
    } as unknown as Parser.SyntaxNode;

    expect(isBlockCombinatorExpression(combinator)).toBe(true);
    expect(blockCombinatorEntries(combinator)).toEqual([entry]);
    expect(isBlockCombinatorExpression(definitionNode("block_expression", {}))).toBe(false);
  });
});
