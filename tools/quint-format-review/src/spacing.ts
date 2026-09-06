import type { NodePair, SourceRange } from "./comparison.js";

export interface SpacingChanges {
  before: SourceRange[];
  after: SourceRange[];
}

interface WhitespaceCharacter {
  value: string;
  offset: number;
}

const horizontalWhitespace = /[\t\v\f ]/u;
const whitespace = /\s/u;

function whitespaceCharacters(source: string, start: number, end: number): WhitespaceCharacter[] {
  const result: WhitespaceCharacter[] = [];
  for (let offset = start; offset < end; offset++) {
    const value = source[offset];
    if (whitespace.test(value)) result.push({ value, offset });
  }
  return result;
}

function appendRanges(target: SourceRange[], characters: WhitespaceCharacter[]) {
  for (const character of characters) {
    if (!horizontalWhitespace.test(character.value)) continue;
    const previous = target[target.length - 1];
    if (previous?.end === character.offset) previous.end++;
    else target.push({ start: character.offset, end: character.offset + 1 });
  }
}

export function whitespaceDifference(
  before: string,
  after: string,
  beforeRange: SourceRange = { start: 0, end: before.length },
  afterRange: SourceRange = { start: 0, end: after.length },
): SpacingChanges {
  const left = whitespaceCharacters(before, beforeRange.start, beforeRange.end);
  const right = whitespaceCharacters(after, afterRange.start, afterRange.end);
  if (left.map(({ value }) => value).join("") === right.map(({ value }) => value).join("")) {
    return { before: [], after: [] };
  }

  let prefix = 0;
  while (
    prefix < left.length &&
    prefix < right.length &&
    left[prefix].value === right[prefix].value
  ) {
    prefix++;
  }
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (
    leftEnd > prefix &&
    rightEnd > prefix &&
    left[leftEnd - 1].value === right[rightEnd - 1].value
  ) {
    leftEnd--;
    rightEnd--;
  }

  const removed: WhitespaceCharacter[] = [];
  const added: WhitespaceCharacter[] = [];
  const leftLength = leftEnd - prefix;
  const rightLength = rightEnd - prefix;
  if (leftLength * rightLength > 250_000) {
    removed.push(...left.slice(prefix, leftEnd));
    added.push(...right.slice(prefix, rightEnd));
  } else {
    const width = rightLength + 1;
    const table = new Uint32Array((leftLength + 1) * width);
    for (let i = leftLength - 1; i >= 0; i--) {
      for (let j = rightLength - 1; j >= 0; j--) {
        table[i * width + j] =
          left[prefix + i].value === right[prefix + j].value
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < leftLength || j < rightLength) {
      if (i < leftLength && j < rightLength && left[prefix + i].value === right[prefix + j].value) {
        i++;
        j++;
      } else if (
        i < leftLength &&
        (j === rightLength || table[(i + 1) * width + j] >= table[i * width + j + 1])
      ) {
        removed.push(left[prefix + i++]);
      } else {
        added.push(right[prefix + j++]);
      }
    }
  }
  const result: SpacingChanges = { before: [], after: [] };
  appendRanges(result.before, removed);
  appendRanges(result.after, added);
  return result;
}

export function spacingChanges(before: string, after: string, nodes: NodePair[]): SpacingChanges {
  const result: SpacingChanges = { before: [], after: [] };
  const tokens = nodes
    .filter((node) => node.token)
    .sort((left, right) => left.before.start - right.before.start);
  let beforeOffset = 0;
  let afterOffset = 0;
  const compare = (beforeEnd: number, afterEnd: number) => {
    const changes = whitespaceDifference(
      before,
      after,
      { start: beforeOffset, end: beforeEnd },
      { start: afterOffset, end: afterEnd },
    );
    result.before.push(...changes.before);
    result.after.push(...changes.after);
  };
  for (const token of tokens) {
    compare(token.before.start, token.after.start);
    beforeOffset = token.before.start;
    afterOffset = token.after.start;
    compare(token.before.end, token.after.end);
    beforeOffset = token.before.end;
    afterOffset = token.after.end;
  }
  compare(before.length, after.length);
  return result;
}
