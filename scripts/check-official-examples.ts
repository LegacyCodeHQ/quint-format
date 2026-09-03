import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "../src/index";
import { namedParseTreeSignature } from "../test/support/parse-tree";

export interface CorpusAuditSummary {
  files: number;
  treePreserved: number;
  idempotent: number;
  diagnosticFree: number;
  quintValidated: number;
}

async function findQuintFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findQuintFiles(path);
      return entry.isFile() && path.endsWith(".qnt") ? [path] : [];
    }),
  );
  return files.flat().sort();
}

function parseWithQuint(path: string): void {
  const result = Bun.spawnSync(["quint", "parse", path]);
  if (result.exitCode === 0) return;
  const detail = result.stderr.toString().trim() || result.stdout.toString().trim();
  throw new Error(`Quint rejected ${path}${detail ? `:\n${detail}` : ""}`);
}

export async function auditQuintExamples(
  directory: string,
  validateReferenceParser = true,
): Promise<CorpusAuditSummary> {
  const root = resolve(directory);
  const files = await findQuintFiles(root);
  if (files.length === 0) throw new Error(`No .qnt files found under ${root}`);

  const parser = new Parser();
  parser.setLanguage(Quint);
  const formattedRoot = validateReferenceParser
    ? await mkdtemp(join(tmpdir(), "quint-format-corpus-"))
    : undefined;
  const formattedFiles: string[] = [];
  const summary: CorpusAuditSummary = {
    files: files.length,
    treePreserved: 0,
    idempotent: 0,
    diagnosticFree: 0,
    quintValidated: 0,
  };

  try {
    for (const file of files) {
      if (validateReferenceParser) parseWithQuint(file);
      const source = await readFile(file, "utf8");
      const formatted = formatQuint(source);
      const sourceTree = parser.parse(source).rootNode;
      const formattedTree = parser.parse(formatted).rootNode;
      const displayPath = relative(root, file);

      if (sourceTree.hasError || formattedTree.hasError) {
        throw new Error(`Tree-sitter reported a syntax error in ${displayPath}`);
      }
      if (
        JSON.stringify(namedParseTreeSignature(formattedTree)) !==
        JSON.stringify(namedParseTreeSignature(sourceTree))
      ) {
        throw new Error(`Formatting changed the parse tree of ${displayPath}`);
      }
      summary.treePreserved += 1;

      if (formatQuint(formatted) !== formatted) {
        throw new Error(`Formatting is not idempotent for ${displayPath}`);
      }
      summary.idempotent += 1;

      const diagnostics = checkQuint(formatted, displayPath);
      if (diagnostics.length > 0) {
        throw new Error(`Formatted output still has diagnostics for ${displayPath}`);
      }
      summary.diagnosticFree += 1;

      if (formattedRoot) {
        const outputPath = join(formattedRoot, displayPath);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, formatted);
        formattedFiles.push(outputPath);
      }
    }

    for (const file of formattedFiles) {
      parseWithQuint(file);
      summary.quintValidated += 1;
    }

    return summary;
  } finally {
    if (formattedRoot) await rm(formattedRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const directory = Bun.argv.slice(2).find((argument) => argument !== "--");
  if (!directory) {
    console.error("Usage: bun run test:official -- /path/to/quint/examples");
    process.exit(2);
  }

  try {
    console.log(JSON.stringify(await auditQuintExamples(directory), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
