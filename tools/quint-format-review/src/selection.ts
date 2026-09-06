import type { NodePair, SourceRange } from "./comparison.js";

export function selectionPair(
  nodes: NodePair[],
  start: number,
  end: number,
  side: "before" | "after" = "before",
): NodePair | undefined {
  const containing = nodes.filter((node) => {
    const r = node[side];
    return r.start <= start && (start === end ? r.end > start : r.end >= end);
  });
  return containing.sort((a, b) => a[side].end - a[side].start - (b[side].end - b[side].start))[0];
}

export function selectionRanges(
  nodes: NodePair[],
  start: number,
  end: number,
  side: "before" | "after" = "before",
): NodePair | undefined {
  if (start === end) return selectionPair(nodes, start, end, side);
  // Choose the outermost fully selected nodes, then include partial boundary tokens.
  // Taking their union supports selections spanning multiple declarations.
  const contained = nodes.filter((node) => node[side].start >= start && node[side].end <= end);
  for (const offset of [start, end - 1]) {
    const boundary = selectionPair(
      nodes.filter((node) => node.token),
      offset,
      offset,
      side,
    );
    if (
      boundary &&
      !contained.some(
        (node) => node[side].start <= boundary[side].start && node[side].end >= boundary[side].end,
      )
    ) {
      contained.push(boundary);
    }
  }
  if (!contained.length) return undefined;
  const union = (which: "before" | "after"): SourceRange =>
    contained.reduce(
      (result, node) => ({
        start: Math.min(result.start, node[which].start),
        end: Math.max(result.end, node[which].end),
      }),
      { start: Infinity, end: 0 },
    );
  return { type: "selection", before: union("before"), after: union("after") };
}

export function markdownComparison(before: string, after: string): string {
  let longest = 0;
  for (const match of `${before}\n${after}`.matchAll(/`+/g))
    longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `### Before\n\n${fence}quint\n${before}\n${fence}\n\n### After\n\n${fence}quint\n${after}\n${fence}\n`;
}
