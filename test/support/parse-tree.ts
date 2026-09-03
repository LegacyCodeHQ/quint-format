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

function normalizedCommentText(node: Parser.SyntaxNode): string {
  const continuationPrefix = " ".repeat(node.startPosition.column);
  return node.text
    .split(/\r\n|\r|\n/)
    .map((line, index) => {
      if (index === 0 || continuationPrefix.length === 0) return line;
      return line.startsWith(continuationPrefix) ? line.slice(continuationPrefix.length) : line;
    })
    .join("\n");
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

  const preservesLeafValue = children.length === 0;
  const value =
    node.type === "comment" || node.type === "documentation_comment"
      ? normalizedCommentText(node)
      : node.text;
  return {
    type: node.type,
    ...(preservesLeafValue ? { value } : {}),
    children,
  };
}
