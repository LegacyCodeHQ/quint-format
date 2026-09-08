export interface FormatPolicy {
  readonly indentWidth: number;
  readonly continuationIndentWidth: number;
  readonly lineWidth: number;
  readonly maxPreservedBlankLines: number;
}

export const defaultFormatPolicy: FormatPolicy = Object.freeze({
  indentWidth: 2,
  continuationIndentWidth: 4,
  lineWidth: 120,
  maxPreservedBlankLines: 1,
});

export const structuralIndentLevels = 1;

export const continuationIndentLevels =
  defaultFormatPolicy.continuationIndentWidth / defaultFormatPolicy.indentWidth;

export const maxPreservedLineBreaks = defaultFormatPolicy.maxPreservedBlankLines + 1;
