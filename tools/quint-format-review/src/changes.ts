export interface ChangeBlock {
  before: { start: number; end: number };
  after: { start: number; end: number };
}

function comparisonLines(source: string): string[] {
  return source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

// Preserve line terminators and expose the empty row created by a final newline.
export function sourceLines(source: string): string[] {
  const lines = comparisonLines(source);
  if (source.endsWith("\n")) lines.push("");
  return lines;
}

// Patience anchors keep large files cheap. Within small unanchored regions, an
// exact LCS separates unchanged lines from edits. Ranges are zero-based, half-open.
export function changedBlocks(before: string, after: string): ChangeBlock[] {
  const a = comparisonLines(before);
  const b = comparisonLines(after);
  const matches: [number, number][] = [];
  function visit(a0: number, a1: number, b0: number, b1: number) {
    while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) matches.push([a0++, b0++]);
    const suffix: [number, number][] = [];
    while (a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]) suffix.push([--a1, --b1]);
    if (a0 < a1 && b0 < b1) {
      const unique = (lines: string[], start: number, end: number) => {
        const map = new Map<string, number>();
        for (let i = start; i < end; i++) map.set(lines[i], map.has(lines[i]) ? -1 : i);
        return map;
      };
      const left = unique(a, a0, a1);
      const right = unique(b, b0, b1);
      const candidates: [number, number][] = [];
      for (const [text, i] of left) {
        const j = right.get(text);
        if (i >= 0 && j !== undefined && j >= 0) candidates.push([i, j]);
      }
      const tails: number[] = [];
      const previous = new Int32Array(candidates.length).fill(-1);
      for (let i = 0; i < candidates.length; i++) {
        let low = 0;
        let high = tails.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (candidates[tails[mid]][1] < candidates[i][1]) low = mid + 1;
          else high = mid;
        }
        if (low) previous[i] = tails[low - 1];
        tails[low] = i;
      }
      if (tails.length) {
        const anchors: [number, number][] = [];
        for (let i = tails[tails.length - 1]; i >= 0; i = previous[i]) anchors.push(candidates[i]);
        for (const [i, j] of anchors.reverse()) {
          visit(a0, i, b0, j);
          matches.push([i, j]);
          a0 = i + 1;
          b0 = j + 1;
        }
        visit(a0, a1, b0, b1);
      } else if ((a1 - a0) * (b1 - b0) <= 250_000) {
        const width = b1 - b0 + 1;
        const table = new Uint32Array((a1 - a0 + 1) * width);
        for (let i = a1 - a0 - 1; i >= 0; i--) {
          for (let j = b1 - b0 - 1; j >= 0; j--) {
            table[i * width + j] =
              a[a0 + i] === b[b0 + j]
                ? table[(i + 1) * width + j + 1] + 1
                : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
          }
        }
        let i = 0;
        let j = 0;
        while (i < a1 - a0 && j < b1 - b0) {
          if (a[a0 + i] === b[b0 + j]) matches.push([a0 + i++, b0 + j++]);
          else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
          else j++;
        }
      }
      // Large repetitive regions without unique anchors form one review block.
    }
    for (const match of suffix.reverse()) matches.push(match);
  }
  visit(0, a.length, 0, b.length);
  matches.push([a.length, b.length]);
  const blocks: ChangeBlock[] = [];
  let i = 0;
  let j = 0;
  for (const [nextI, nextJ] of matches) {
    if (i < nextI || j < nextJ)
      blocks.push({ before: { start: i, end: nextI }, after: { start: j, end: nextJ } });
    i = nextI + 1;
    j = nextJ + 1;
  }
  return blocks;
}
