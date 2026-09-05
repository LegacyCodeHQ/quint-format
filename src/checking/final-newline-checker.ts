import type { FormatDiagnostic } from "../diagnostics.js";

function positionAtIndex(source: string, index: number) {
  const lines = source.slice(0, index).split(/\r\n|\r|\n/);
  const lastLine = lines.at(-1) ?? "";
  return { row: lines.length - 1, column: Array.from(lastLine).length };
}

export function checkFinalNewline(
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const trailingNewlines = source.match(/(?:\r\n|\r|\n)+$/)?.[0] ?? "";

  if (trailingNewlines === "\n") return [];

  const firstExcessIndex =
    trailingNewlines.length === 0 ? source.length : source.length - trailingNewlines.length + 1;
  const position = positionAtIndex(source, firstExcessIndex);
  return [
    {
      filePath,
      line: position.row + 1,
      column: position.column + 1,
      length: 1,
      rule: "format/final-newline",
      message: "expected exactly one final newline",
      sourceLine: lines[position.row] ?? "",
    },
  ];
}
