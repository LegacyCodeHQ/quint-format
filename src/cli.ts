#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { checkQuint, QuintSyntaxError, renderDiagnostic } from "./index";

const [command, filePath, ...rest] = process.argv.slice(2);

if (command !== "--check" || !filePath || rest.length > 0) {
  process.stderr.write("Usage: quint-format --check <file>\n");
  process.exitCode = 2;
} else {
  try {
    const source = await readFile(filePath, "utf8");
    const diagnostics = checkQuint(source, filePath);

    for (const diagnostic of diagnostics) {
      process.stderr.write(renderDiagnostic(diagnostic));
    }

    if (diagnostics.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof QuintSyntaxError) {
      process.stderr.write(renderDiagnostic({ filePath, ...error.diagnostic }));
      process.exitCode = 2;
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${filePath}:1:1: error[internal]: ${message}\n`);
      process.exitCode = 2;
    }
  }
}
