#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { checkQuint, formatQuint, QuintSyntaxError, renderDiagnostic } from "./index";

const [command, ...filePaths] = process.argv.slice(2);

async function discoverQuintFiles(path: string): Promise<string[]> {
  const metadata = await stat(path);
  if (!metadata.isDirectory()) return [path];

  const entries = await readdir(path, { withFileTypes: true });
  const discovered: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...(await discoverQuintFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".qnt")) {
      discovered.push(entryPath);
    }
  }
  return discovered;
}

async function writeAtomically(filePath: string, contents: string) {
  const metadata = await stat(filePath);
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, contents, { mode: metadata.mode });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

if (command && command !== "--check" && filePaths.length === 0) {
  try {
    const source = await readFile(command, "utf8");
    process.stdout.write(formatQuint(source));
  } catch (error) {
    if (error instanceof QuintSyntaxError) {
      process.stderr.write(renderDiagnostic({ filePath: command, ...error.diagnostic }));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${command}:1:1: error[internal]: ${message}\n`);
    }
    process.exitCode = 2;
  }
} else if ((command !== "--check" && command !== "--write") || filePaths.length === 0) {
  process.stderr.write(
    "Usage: quint-format <file> | quint-format --check <path>... | quint-format --write <path>...\n",
  );
  process.exitCode = 2;
} else {
  let hasFormattingViolations = false;
  let hasOperationalFailure = false;
  const discoveredFilePaths: string[] = [];

  for (const filePath of filePaths) {
    try {
      discoveredFilePaths.push(...(await discoverQuintFiles(filePath)));
    } catch (error) {
      hasOperationalFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${filePath}:1:1: error[internal]: ${message}\n`);
    }
  }

  for (const filePath of discoveredFilePaths) {
    try {
      const source = await readFile(filePath, "utf8");
      if (command === "--write") {
        await writeAtomically(filePath, formatQuint(source));
      } else {
        const diagnostics = checkQuint(source, filePath);
        for (const diagnostic of diagnostics) {
          process.stderr.write(renderDiagnostic(diagnostic));
        }
        hasFormattingViolations ||= diagnostics.length > 0;
      }
    } catch (error) {
      hasOperationalFailure = true;
      if (error instanceof QuintSyntaxError) {
        process.stderr.write(renderDiagnostic({ filePath, ...error.diagnostic }));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${filePath}:1:1: error[internal]: ${message}\n`);
      }
    }
  }

  process.exitCode = hasOperationalFailure ? 2 : hasFormattingViolations ? 1 : 0;
}
