export interface FormatDiagnostic {
  filePath: string;
  line: number;
  column: number;
  length: number;
  rule: string;
  message: string;
  sourceLine: string;
}

export function renderDiagnostic(diagnostic: FormatDiagnostic): string {
  const lineNumber = String(diagnostic.line);
  const gutter = " ".repeat(lineNumber.length);
  const tabWidth = 2;
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const displayWidth = (value: string): number => {
    let width = 0;
    for (const { segment } of graphemes.segment(value)) {
      if (/\p{Extended_Pictographic}/u.test(segment)) {
        width += 2;
      } else if (
        /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(segment)
      ) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  };
  const expandTabs = (value: string): string => {
    let expanded = "";
    let width = 0;
    for (const character of value) {
      if (character === "\t") {
        const spaces = tabWidth - (width % tabWidth);
        expanded += " ".repeat(spaces);
        width += spaces;
      } else {
        expanded += character;
        width += displayWidth(character);
      }
    }
    return expanded;
  };
  const prefix = diagnostic.sourceLine.slice(0, diagnostic.column - 1);
  const highlighted = diagnostic.sourceLine.slice(
    diagnostic.column - 1,
    diagnostic.column - 1 + diagnostic.length,
  );
  const underline = `${" ".repeat(displayWidth(expandTabs(prefix)))}${"^".repeat(
    Math.max(1, displayWidth(expandTabs(highlighted))),
  )}`;
  const sourceLine = expandTabs(diagnostic.sourceLine);

  return [
    `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}: error[${diagnostic.rule}]: ${diagnostic.message}`,
    `${gutter} |`,
    `${lineNumber} |${sourceLine.length > 0 ? ` ${sourceLine}` : ""}`,
    `${gutter} | ${underline}`,
    `${gutter} |`,
    "",
  ].join("\n");
}
