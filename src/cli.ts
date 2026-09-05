#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkQuint, formatQuint, QuintSyntaxError, renderDiagnostic } from "./index.js";

export interface CliOutput {
  writeStdout(value: string): void;
  writeStderr(value: string): void;
}

const processOutput: CliOutput = {
  writeStdout: (value) => process.stdout.write(value),
  writeStderr: (value) => process.stderr.write(value),
};

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

export async function runCli(args: string[], output: CliOutput = processOutput): Promise<number> {
  const [command, ...filePaths] = args;

  if (command && command !== "--check" && filePaths.length === 0) {
    try {
      const source = await readFile(command, "utf8");
      output.writeStdout(formatQuint(source));
      return 0;
    } catch (error) {
      if (error instanceof QuintSyntaxError) {
        for (const diagnostic of error.diagnostics) {
          output.writeStderr(renderDiagnostic({ filePath: command, ...diagnostic }));
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        output.writeStderr(`${command}:1:1: error[internal]: ${message}\n`);
      }
      return 2;
    }
  }

  if ((command !== "--check" && command !== "--write") || filePaths.length === 0) {
    output.writeStderr(
      "Usage: quintfmt <file> | quintfmt --check <path>... | quintfmt --write <path>...\n",
    );
    return 2;
  }

  let hasFormattingViolations = false;
  let hasOperationalFailure = false;
  const discoveredFilePaths: string[] = [];

  for (const filePath of filePaths) {
    try {
      discoveredFilePaths.push(...(await discoverQuintFiles(filePath)));
    } catch (error) {
      hasOperationalFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      output.writeStderr(`${filePath}:1:1: error[internal]: ${message}\n`);
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
          output.writeStderr(renderDiagnostic(diagnostic));
        }
        hasFormattingViolations ||= diagnostics.length > 0;
      }
    } catch (error) {
      hasOperationalFailure = true;
      if (error instanceof QuintSyntaxError) {
        for (const diagnostic of error.diagnostics) {
          output.writeStderr(renderDiagnostic({ filePath, ...diagnostic }));
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        output.writeStderr(`${filePath}:1:1: error[internal]: ${message}\n`);
      }
    }
  }

  return hasOperationalFailure ? 2 : hasFormattingViolations ? 1 : 0;
}

const executablePath = process.argv[1];
if (executablePath && pathToFileURL(executablePath).href === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
