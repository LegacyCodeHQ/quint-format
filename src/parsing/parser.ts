import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import type { FormatDiagnostic } from "@/core/diagnostics.js";

const parser = new Parser();
parser.setLanguage(Quint);

type SourceDiagnostic = Omit<FormatDiagnostic, "filePath">;

export class QuintSyntaxError extends SyntaxError {
  readonly diagnostic: SourceDiagnostic;
  readonly diagnostics: SourceDiagnostic[];

  constructor(diagnostics: SourceDiagnostic[]) {
    const diagnostic = diagnostics[0];
    if (!diagnostic) throw new Error("A Quint syntax error requires at least one diagnostic");
    super(diagnostic.message);
    this.name = "QuintSyntaxError";
    this.diagnostic = diagnostic;
    this.diagnostics = diagnostics;
  }
}

function findSyntaxProblems(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  if (node.isMissing || (node.isError && !node.hasError)) {
    return [node];
  }

  return node.children
    .filter((child) => child.hasError || child.isError || child.isMissing)
    .flatMap(findSyntaxProblems);
}

export function parseQuint(source: string): Parser.SyntaxNode {
  const root = parser.parse(source).rootNode;

  if (!root.hasError) {
    return root;
  }

  const problems = findSyntaxProblems(root);
  if (problems.length === 0) {
    throw new SyntaxError("Cannot locate the Quint syntax error");
  }

  const lines = source.split(/\r?\n/);
  throw new QuintSyntaxError(
    problems.map((problem) => {
      const isMissingAtEndOfFile =
        problem.isMissing && source.slice(problem.endIndex).trim() === "";
      const position = isMissingAtEndOfFile ? root.endPosition : problem.startPosition;
      const sourceLine = lines[position.row] ?? "";
      const length =
        problem.isMissing || problem.startPosition.row !== problem.endPosition.row
          ? 1
          : Math.max(1, problem.endPosition.column - problem.startPosition.column);
      return {
        line: position.row + 1,
        column: position.column + 1,
        length,
        rule: problem.isMissing ? "parse/missing-token" : "parse/unexpected-token",
        message: problem.isMissing ? `expected '${problem.type}'` : `unexpected '${problem.text}'`,
        sourceLine,
      };
    }),
  );
}
