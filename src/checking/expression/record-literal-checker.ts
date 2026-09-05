import type Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";

export function checkRecordLiterals(
  recordLiterals: Parser.SyntaxNode[],
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  for (const recordLiteral of recordLiterals) {
    const openBrace = recordLiteral.children.find((child) => child.type === "{");
    const closeBrace = recordLiteral.children.find((child) => child.type === "}");
    const fields = recordLiteral.namedChildren.filter(
      (child) => child.type === "record_literal_field",
    );
    const spreads = recordLiteral.namedChildren.filter((child) => child.type === "record_spread");
    const comments = recordLiteral.namedChildren.filter(
      (child) => child.type === "comment" || child.type === "documentation_comment",
    );
    const elements = [...fields, ...spreads].sort(
      (left, right) => left.startIndex - right.startIndex,
    );
    const children = recordLiteral.namedChildren;
    const commas = recordLiteral.children.filter((child) => child.type === ",");
    const firstElement = children[0];
    const lastElement = children.at(-1);
    if (!openBrace || !closeBrace || !firstElement || !lastElement) {
      throw new Error("Unable to locate the record literal delimiters");
    }

    const afterOpenBrace = source.slice(openBrace.endIndex, firstElement.startIndex);
    const isCommentedRecord = comments.length > 0;
    const isExpandedRecord =
      isCommentedRecord || recordLiteral.startPosition.row < recordLiteral.endPosition.row;
    const hasCanonicalOpening = isExpandedRecord
      ? firstElement.startPosition.row > openBrace.startPosition.row
      : afterOpenBrace === " ";
    if (!hasCanonicalOpening) {
      const row = openBrace.endPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: openBrace.endPosition.column + 1,
        length: Math.max(1, afterOpenBrace.length),
        rule: isExpandedRecord
          ? isCommentedRecord
            ? "format/commented-record-layout"
            : "format/multiline-record-layout"
          : "format/expression-delimiter-spacing",
        message: isExpandedRecord
          ? isCommentedRecord
            ? "expected commented record contents on separate lines"
            : "expected record contents on separate lines"
          : "expected one space after '{'",
        sourceLine: lines[row] ?? "",
      });
    }

    for (const field of fields) {
      const name = field.childForFieldName("name");
      const value = field.childForFieldName("value");
      const colon = field.children.find((child) => child.type === ":");
      if (!name || !value || !colon) {
        throw new Error("Unable to locate a record literal field");
      }
      const beforeColon = source.slice(name.endIndex, colon.startIndex);
      if (beforeColon !== "") {
        const row = name.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: name.endPosition.column + 1,
          length: Math.max(1, beforeColon.length),
          rule: "format/expression-colon-spacing",
          message: "expected no space before ':'",
          sourceLine: lines[row] ?? "",
        });
      }
      const afterColon = source.slice(colon.endIndex, value.startIndex);
      if (afterColon !== " ") {
        const row = colon.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: colon.endPosition.column + 1,
          length: Math.max(1, afterColon.length),
          rule: "format/expression-colon-spacing",
          message: "expected one space after ':'",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    for (const spread of spreads) {
      const spreadOperator = spread.children.find((child) => child.type === "...");
      const value = spread.childForFieldName("value");
      if (!spreadOperator || !value) {
        throw new Error("Unable to locate a record spread value");
      }
      const afterSpread = source.slice(spreadOperator.endIndex, value.startIndex);
      if (afterSpread !== "") {
        const row = spreadOperator.endPosition.row;
        diagnostics.push({
          filePath,
          line: row + 1,
          column: spreadOperator.endPosition.column + 1,
          length: Math.max(1, afterSpread.length),
          rule: "format/record-spread-spacing",
          message: "expected no space after '...'",
          sourceLine: lines[row] ?? "",
        });
      }
    }

    if (isExpandedRecord) {
      for (const [index, element] of elements.entries()) {
        const nextElement = elements[index + 1];
        const comma = commas.find(
          (candidate) =>
            candidate.startIndex >= element.endIndex &&
            candidate.startIndex < (nextElement?.startIndex ?? closeBrace.startIndex),
        );
        if (!comma || source.slice(element.endIndex, comma.startIndex) !== "") {
          const row = element.endPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: element.endPosition.column + 1,
            length: 1,
            rule: isCommentedRecord
              ? "format/commented-record-separator"
              : "format/multiline-record-separator",
            message: "expected a trailing comma after each record element",
            sourceLine: lines[row] ?? "",
          });
        }
        if (
          comma &&
          nextElement?.startPosition.row === comma.endPosition.row &&
          source.slice(comma.endIndex, nextElement.startIndex) !== " "
        ) {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.endPosition.column + 1,
            length: Math.max(1, nextElement.startIndex - comma.endIndex),
            rule: "format/multiline-record-separator",
            message: "expected one space between grouped record elements",
            sourceLine: lines[row] ?? "",
          });
        }
      }
      for (const comment of comments) {
        const previousElement = [...elements]
          .reverse()
          .find((element) => element.endIndex <= comment.startIndex);
        if (previousElement?.endPosition.row === comment.startPosition.row) {
          const comma = commas.find(
            (candidate) =>
              candidate.startIndex >= previousElement.endIndex &&
              candidate.endIndex <= comment.startIndex,
          );
          if (!comma || source.slice(comma.endIndex, comment.startIndex) !== " ") {
            const row = comment.startPosition.row;
            diagnostics.push({
              filePath,
              line: row + 1,
              column: comment.startPosition.column + 1,
              length: 2,
              rule: "format/comment-spacing",
              message: "expected one space before a trailing comment",
              sourceLine: lines[row] ?? "",
            });
          }
        }
      }
    } else {
      for (const [index, comma] of commas.entries()) {
        const previousElement = elements[index];
        const nextElement = elements[index + 1];
        if (!previousElement || !nextElement) {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/unnecessary-trailing-comma",
            message: "trailing commas are omitted from inline records",
            sourceLine: lines[row] ?? "",
          });
          continue;
        }
        const beforeComma = source.slice(previousElement.endIndex, comma.startIndex);
        const afterComma = source.slice(comma.endIndex, nextElement.startIndex);
        if (beforeComma !== "" || afterComma !== " ") {
          const row = comma.startPosition.row;
          diagnostics.push({
            filePath,
            line: row + 1,
            column: comma.startPosition.column + 1,
            length: 1,
            rule: "format/expression-separator-spacing",
            message: `expected ', ' between record ${spreads.length > 0 ? "elements" : "fields"}`,
            sourceLine: lines[row] ?? "",
          });
        }
      }
    }

    const trailingComma = commas.find((comma) => comma.startIndex >= lastElement.endIndex);
    const closeAnchor = trailingComma ?? lastElement;
    const beforeCloseBrace = source.slice(closeAnchor.endIndex, closeBrace.startIndex);
    const hasCanonicalClosing = isExpandedRecord
      ? closeBrace.startPosition.row > closeAnchor.endPosition.row
      : beforeCloseBrace === " ";
    if (!hasCanonicalClosing) {
      const row = closeBrace.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: closeAnchor.endPosition.column + 1,
        length: Math.max(1, beforeCloseBrace.length),
        rule: isExpandedRecord
          ? isCommentedRecord
            ? "format/commented-record-layout"
            : "format/multiline-record-layout"
          : "format/expression-delimiter-spacing",
        message: isExpandedRecord
          ? "expected the closing brace on its own line"
          : "expected one space before '}'",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  return diagnostics;
}
