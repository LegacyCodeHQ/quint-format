import { describe, expect, test } from "bun:test";
import type Parser from "tree-sitter";
import { definitionBody } from "@/parsing/syntax.js";

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
});
