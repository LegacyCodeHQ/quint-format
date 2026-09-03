import type Parser from "tree-sitter";

interface NamedParseTreeChild {
  field?: string;
  node?: NamedParseTreeSignature;
  token?: {
    type: string;
    text: string;
  };
}

export interface NamedParseTreeSignature {
  type: string;
  value?: string;
  children: NamedParseTreeChild[];
}

export function namedParseTreeSignature(node: Parser.SyntaxNode): NamedParseTreeSignature {
  const children: NamedParseTreeChild[] = [];

  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (!child) continue;
    const field = node.fieldNameForChild(index) ?? undefined;

    if (child.isNamed) {
      children.push({ field, node: namedParseTreeSignature(child) });
    } else if (field) {
      children.push({ field, token: { type: child.type, text: child.text } });
    }
  }

  const preservesLeafValue =
    children.length === 0 && node.type !== "comment" && node.type !== "documentation_comment";
  return {
    type: node.type,
    ...(preservesLeafValue ? { value: node.text } : {}),
    children,
  };
}
