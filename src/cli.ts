#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { checkQuint, QuintSyntaxError, renderDiagnostic } from "./index";

const [command, ...filePaths] = process.argv.slice(2);

if (command !== "--check" || filePaths.length === 0) {
  process.stderr.write("Usage: quint-format --check <file>...\n");
  process.exitCode = 2;
} else {
  let hasFormattingViolations = false;
  let hasOperationalFailure = false;

  for (const filePath of filePaths) {
    try {
      const source = await readFile(filePath, "utf8");
      const diagnostics = checkQuint(source, filePath);

      for (const diagnostic of diagnostics) {
        process.stderr.write(renderDiagnostic(diagnostic));
      }

      hasFormattingViolations ||= diagnostics.length > 0;
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
