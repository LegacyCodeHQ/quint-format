import type Parser from "tree-sitter";
import { parseQuint } from "../../../src/parsing/parser.js";
import { type ChangeBlock, changedBlocks } from "./changes.js";

export interface SourceRange {
  start: number;
  end: number;
}
export interface NodePair {
  type: string;
  token?: boolean;
  before: SourceRange;
  after: SourceRange;
}
export interface Comparison {
  before: string;
  after: string | null;
  nodes: NodePair[];
  changed: boolean;
  changes: ChangeBlock[];
  error?: string;
  mappingWarning?: string;
}

function leaves(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  return node.children.length ? node.children.flatMap(leaves) : [node];
}

const optionalPunctuation = new Set([";", "(", ")", ","]);
function normalizedToken(node: Parser.SyntaxNode): string {
  if (node.type !== "comment" && node.type !== "documentation_comment") return node.text;
  const prefix = " ".repeat(node.startPosition.column);
  return node.text
    .split(/\r\n|\r|\n/)
    .map((line, index) => {
      const trimmed = line.replace(/[ \t]+$/u, "");
      return index > 0 && prefix && trimmed.startsWith(prefix)
        ? trimmed.slice(prefix.length)
        : trimmed;
    })
    .join("\n");
}
const key = (node: Parser.SyntaxNode) => `${node.type}\0${normalizedToken(node)}`;
const range = (node: Parser.SyntaxNode): SourceRange => ({
  start: node.startIndex,
  end: node.endIndex,
});

// Align concrete tokens, retaining their actual parser offsets. Only formatter-owned
// punctuation can be skipped; never guess a correspondence after a semantic mismatch.
export function mapNodes(before: Parser.SyntaxNode, after: Parser.SyntaxNode): NodePair[] {
  const left = leaves(before);
  const right = leaves(after);
  const aligned = new Map<number, Parser.SyntaxNode>();
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    const a = left[i];
    const b = right[j];
    if (a && b && key(a) === key(b)) {
      aligned.set(a.id, b);
      i++;
      j++;
    } else if (a && optionalPunctuation.has(a.text)) {
      i++;
    } else if (b && optionalPunctuation.has(b.text)) {
      j++;
    } else {
      throw new Error(
        "Token correspondence changed; linked selection is unavailable for this file.",
      );
    }
  }
  const pairs: NodePair[] = [];
  function visit(node: Parser.SyntaxNode): SourceRange | undefined {
    const token = aligned.get(node.id);
    const children = node.children.map(visit).filter((item) => item !== undefined);
    const mapped = token
      ? range(token)
      : children.length
        ? { start: children[0].start, end: children[children.length - 1].end }
        : undefined;
    if (mapped)
      pairs.push({
        type: node.type,
        token: node.children.length === 0,
        before: range(node),
        after: mapped,
      });
    return mapped;
  }
  visit(before);
  return pairs;
}

export function compareSource(before: string, after: string): Comparison {
  try {
    const input = parseQuint(before);
    const output = parseQuint(after);
    const result: Comparison = {
      before,
      after,
      nodes: [],
      changed: before !== after,
      changes: changedBlocks(before, after),
    };
    try {
      result.nodes = mapNodes(input, output);
    } catch (error) {
      result.mappingWarning = String(error instanceof Error ? error.message : error);
    }
    return result;
  } catch (error) {
    return {
      before,
      after: null,
      nodes: [],
      changed: false,
      changes: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function failedComparison(before: string, error: unknown): Comparison {
  return {
    before,
    after: null,
    nodes: [],
    changed: false,
    changes: [],
    error: error instanceof Error ? error.message : String(error),
  };
}
