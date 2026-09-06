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
  sources?: { before: string; after: string },
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
  const result: NodePair = {
    type: "selection",
    before: union("before"),
    after: union("after"),
  };
  if (!sources) return result;
  for (const which of ["before", "after"] as const) {
    const source = sources[which];
    const lineStart = source.lastIndexOf("\n", Math.max(0, result[which].start - 1)) + 1;
    if (/^[\t ]*$/.test(source.slice(lineStart, result[which].start))) {
      result[which].start = lineStart;
    }
  }
  if (end === sources[side].length) {
    result.before.end = sources.before.length;
    result.after.end = sources.after.length;
  }
  return result;
}

export function finalNewlineLabel(source: string): string {
  if (source.endsWith("\r\n")) return "CRLF · final newline";
  if (source.endsWith("\n")) return "LF · final newline";
  if (source.endsWith("\r")) return "CR · final newline";
  return "No final newline";
}

export function markdownComparison(before: string, after: string): string {
  let longest = 0;
  for (const match of `${before}\n${after}`.matchAll(/`+/g))
    longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  const fenced = (source: string) =>
    `${source}${source.endsWith("\n") || source.endsWith("\r") ? "" : "\n"}${fence}\n`;
  return `### Before\n\n${fence}quint\n${fenced(before)}\n### After\n\n${fence}quint\n${fenced(after)}`;
}
