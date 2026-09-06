import { describe, expect, test } from "bun:test";
import type Parser from "tree-sitter";
import {
  blockCombinatorEntries,
  callExpressionTarget,
  definitionBody,
  isBlockCombinatorExpression,
  isCallExpression,
  isMultilineUfcsContinuation,
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
  test("reads semantic value and operator body fields", () => {
    const expression = { id: 1 } as Parser.SyntaxNode;

    expect(definitionBody(definitionNode("value_definition", { value: expression }))).toBe(
      expression,
    );
    expect(definitionBody(definitionNode("value_definition", { body: expression }))).toBeNull();
    expect(definitionBody(definitionNode("operator_definition", { body: expression }))).toBe(
      expression,
    );
    expect(definitionBody(definitionNode("operator_definition", { value: expression }))).toBeNull();
    expect(
      definitionBody(definitionNode("record_literal_field", { value: expression })),
    ).toBeNull();
  });

  test("classifies block combinators and reads their grammar-declared entry fields", () => {
    const entry = { id: 2 } as Parser.SyntaxNode;
    const combinator = {
      type: "any_expression",
      childrenForFieldName: (name: string) => (name === "choice" ? [entry] : []),
    } as unknown as Parser.SyntaxNode;

    expect(isBlockCombinatorExpression(combinator)).toBe(true);
    expect(blockCombinatorEntries(combinator)).toEqual([entry]);
    expect(isBlockCombinatorExpression(definitionNode("block_expression", {}))).toBe(false);
  });

  test("reads named UFCS targets without conflating field access", () => {
    const receiver = { id: 3, endPosition: { row: 0, column: 5 } } as Parser.SyntaxNode;
    const method = { id: 4 } as Parser.SyntaxNode;
    const dot = { type: ".", startPosition: { row: 1, column: 4 } } as Parser.SyntaxNode;
    const fields: Record<string, Parser.SyntaxNode> = { receiver, method };
    const ufcs = {
      type: "ufcs_call_expression",
      children: [receiver, dot, method],
      childForFieldName: (name: string) => fields[name] ?? null,
    } as unknown as Parser.SyntaxNode;

    expect(isCallExpression(ufcs)).toBe(true);
    expect(callExpressionTarget(ufcs)).toEqual({
      kind: "ufcs",
      functionNode: method,
      receiver,
      method,
      dot,
    });
    expect(isMultilineUfcsContinuation(ufcs)).toBe(true);
    expect(isCallExpression(definitionNode("field_access_expression", {}))).toBe(false);
  });
});
