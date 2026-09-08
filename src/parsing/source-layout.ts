import type Parser from "tree-sitter";

export interface SourceLayoutFacts {
  readonly startRow: number;
  readonly endRow: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly lineSpan: number;
  readonly multiline: boolean;
}

export function lineBreaksBetween(previous: Parser.SyntaxNode, next: Parser.SyntaxNode): number {
  return Math.max(0, next.startPosition.row - previous.endPosition.row);
}

export function hasLineBreakBetween(previous: Parser.SyntaxNode, next: Parser.SyntaxNode): boolean {
  return lineBreaksBetween(previous, next) > 0;
}

export function areOnSameLine(left: Parser.SyntaxNode, right: Parser.SyntaxNode): boolean {
  return left.endPosition.row === right.startPosition.row;
}

export function isMultiline(node: Parser.SyntaxNode): boolean {
  return node.startPosition.row !== node.endPosition.row;
}

export class SourceLayoutIndex {
  readonly #factsByNodeId = new Map<number, SourceLayoutFacts>();

  constructor(root: Parser.SyntaxNode) {
    this.#index(root);
  }

  #index(node: Parser.SyntaxNode): void {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    this.#factsByNodeId.set(node.id, {
      startRow,
      endRow,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      lineSpan: endRow - startRow + 1,
      multiline: startRow !== endRow,
    });
    for (const child of node.children) this.#index(child);
  }

  factsFor(node: Parser.SyntaxNode): SourceLayoutFacts {
    const facts = this.#factsByNodeId.get(node.id);
    if (!facts) throw new Error(`Source layout does not contain node ${node.id}`);
    return facts;
  }

  lineBreaksBetween(previous: Parser.SyntaxNode, next: Parser.SyntaxNode): number {
    return Math.max(0, this.factsFor(next).startRow - this.factsFor(previous).endRow);
  }

  blankLinesBetween(previous: Parser.SyntaxNode, next: Parser.SyntaxNode): number {
    return Math.max(0, this.lineBreaksBetween(previous, next) - 1);
  }

  hasLineBreakBetween(previous: Parser.SyntaxNode, next: Parser.SyntaxNode): boolean {
    return this.lineBreaksBetween(previous, next) > 0;
  }

  areOnSameLine(left: Parser.SyntaxNode, right: Parser.SyntaxNode): boolean {
    return this.factsFor(left).endRow === this.factsFor(right).startRow;
  }
}

export function indexSourceLayout(root: Parser.SyntaxNode): SourceLayoutIndex {
  return new SourceLayoutIndex(root);
}
