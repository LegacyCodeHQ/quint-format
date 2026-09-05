import type { ModuleDeclaration } from "../core/analysis.js";
import type { FormatDiagnostic } from "../core/diagnostics.js";

export function checkModuleInstance(
  declaration: ModuleDeclaration,
  source: string,
  filePath: string,
  lines: string[],
): FormatDiagnostic[] {
  if (!declaration.instanceOpenParen || !declaration.instanceCloseParen) return [];

  const diagnostics: FormatDiagnostic[] = [];
  const overrides = declaration.instanceOverrides ?? [];
  const afterModule = source.slice(
    declaration.nameNode.endIndex,
    declaration.instanceOpenParen.startIndex,
  );
  const first = overrides[0];
  const last = overrides.at(-1);
  const insideStart = first
    ? source.slice(declaration.instanceOpenParen.endIndex, first.startIndex)
    : source.slice(
        declaration.instanceOpenParen.endIndex,
        declaration.instanceCloseParen.startIndex,
      );
  const insideEnd = last
    ? source.slice(last.endIndex, declaration.instanceCloseParen.startIndex)
    : "";
  const isExpandedInstance = Boolean(
    first &&
      last &&
      first.startPosition.row > declaration.instanceOpenParen.endPosition.row &&
      declaration.instanceCloseParen.startPosition.row > last.endPosition.row,
  );
  const hasCanonicalDelimiters = isExpandedInstance
    ? afterModule === "" &&
      first?.startPosition.column === declaration.node.startPosition.column + 2 &&
      declaration.instanceCloseParen.startPosition.column === declaration.node.startPosition.column
    : afterModule === "" && insideStart === "" && insideEnd === "";
  if (!hasCanonicalDelimiters) {
    const row = declaration.instanceOpenParen.startPosition.row;
    diagnostics.push({
      filePath,
      line: row + 1,
      column: declaration.instanceOpenParen.startPosition.column + 1,
      length: 1,
      rule: "format/instance-delimiter-spacing",
      message: isExpandedInstance
        ? "expected expanded instance overrides with two-space indentation"
        : "expected no space around instance parentheses",
      sourceLine: lines[row] ?? "",
    });
  }
  for (const override of overrides) {
    const overrideName = override.childForFieldName("name");
    const value = override.childForFieldName("value");
    const equals = override.children.find((child) => child.type === "=");
    if (!overrideName || !value || !equals) {
      throw new Error("Unable to locate the instance override syntax");
    }
    if (
      source.slice(overrideName.endIndex, equals.startIndex) !== " " ||
      source.slice(equals.endIndex, value.startIndex) !== " "
    ) {
      const row = equals.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: equals.startPosition.column + 1,
        length: 1,
        rule: "format/instance-override-spacing",
        message: "expected one space around '='",
        sourceLine: lines[row] ?? "",
      });
    }
  }
  for (const [index, comma] of (declaration.instanceCommas ?? []).entries()) {
    const previous = overrides[index];
    const next = overrides[index + 1];
    if (!previous || !next) {
      const row = comma.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: comma.startPosition.column + 1,
        length: 1,
        rule: "format/instance-trailing-comma",
        message: "trailing commas are omitted from inline instances",
        sourceLine: lines[row] ?? "",
      });
    } else if (
      source.slice(previous.endIndex, comma.startIndex) !== "" ||
      (isExpandedInstance
        ? !/^\r?\n[\t ]*$/.test(source.slice(comma.endIndex, next.startIndex)) ||
          next.startPosition.column !== declaration.node.startPosition.column + 2
        : source.slice(comma.endIndex, next.startIndex) !== " ")
    ) {
      const row = comma.startPosition.row;
      diagnostics.push({
        filePath,
        line: row + 1,
        column: comma.startPosition.column + 1,
        length: 1,
        rule: "format/instance-override-separator-spacing",
        message: isExpandedInstance
          ? "expected each instance override on its own indented line"
          : "expected ', ' between instance overrides",
        sourceLine: lines[row] ?? "",
      });
    }
  }

  return diagnostics;
}
