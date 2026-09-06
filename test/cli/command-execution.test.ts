import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatVersion } from "../../src/version.js";
import { projectRoot, runCliInProcess } from "../support/cli";

const packageVersion = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).version;

describe("command-line checker", () => {
  describe("command execution", () => {
    test("identifies npm and development builds", () => {
      expect(
        formatVersion({ version: "1.2.3", channel: "npm", commit: "ignored", dirty: false }),
      ).toBe("quintfmt 1.2.3");
      expect(
        formatVersion({ version: "1.2.3", channel: "dev", commit: "abc123", dirty: false }),
      ).toBe("quintfmt 1.2.3 (dev abc123)");
      expect(
        formatVersion({ version: "1.2.3", channel: "dev", commit: "abc123", dirty: true }),
      ).toBe("quintfmt 1.2.3 (dev abc123-dirty)");
    });

    test("prints build provenance with both version commands", async () => {
      const option = await runCliInProcess("--version");
      const command = await runCliInProcess("version");

      expect(option.exitCode).toBe(0);
      expect(option.stdout).toBe(`quintfmt ${packageVersion} (dev unknown-dirty)\n`);
      expect(option.stderr).toBe("");
      expect(command).toEqual(option);
    });

    test("runs the compiled distribution with Node.js", () => {
      const build = Bun.spawnSync(["bun", "run", "build"], { cwd: projectRoot });

      expect(build.exitCode).toBe(0);

      const manifest = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
      expect(manifest.bin).toEqual({ quintfmt: "dist/cli.js" });
      expect(manifest.engines).toEqual({ node: ">=22" });

      const result = Bun.spawnSync(
        ["node", "dist/cli.js", "test/fixtures/compact-empty-module.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toMatchSnapshot();
      expect(result.stderr.toString()).toBe("");

      const version = Bun.spawnSync(["node", "dist/cli.js", "--version"], { cwd: projectRoot });
      expect(version.exitCode).toBe(0);
      if (process.env.QUINT_FORMAT_BUILD_CHANNEL === "npm") {
        expect(version.stdout.toString()).toBe(`quintfmt ${packageVersion}\n`);
      } else {
        expect(version.stdout.toString()).toMatch(
          new RegExp(
            `^quintfmt ${packageVersion.replaceAll(".", "\\.")} \\(dev [0-9a-f]{12}(?:-dirty)?\\)\\n$`,
          ),
        );
      }
      expect(version.stderr.toString()).toBe("");
    });

    test("runs the compiled distribution through an npm-style binary symlink", () => {
      const scratch = mkdtempSync(join(tmpdir(), "quint-format-bin-link-"));
      const binaryPath = join(scratch, "quintfmt");
      const build = Bun.spawnSync(["bun", "run", "build"], { cwd: projectRoot });

      try {
        expect(build.exitCode).toBe(0);
        symlinkSync(join(projectRoot, "dist/cli.js"), binaryPath);
        const result = Bun.spawnSync(
          ["node", binaryPath, "test/fixtures/compact-empty-module.qnt"],
          { cwd: projectRoot },
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toBe("module Example {\n}\n");
        expect(result.stderr.toString()).toBe("");
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    test("formats one file to standard output", async () => {
      const result = await runCliInProcess("test/fixtures/compact-empty-module.qnt");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot();
      expect(result.stderr).toBe("");
    });

    test("writes one file atomically", async () => {
      const scratch = mkdtempSync(join(tmpdir(), "quint-format-write-"));
      const filePath = join(scratch, "example.qnt");
      writeFileSync(filePath, "module Example {}\n");

      try {
        const result = await runCliInProcess("--write", filePath);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe("");
        expect(readFileSync(filePath, "utf8")).toMatchSnapshot();
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    test("does not replace a file that has invalid syntax", async () => {
      const scratch = mkdtempSync(join(tmpdir(), "quint-format-write-error-"));
      const filePath = join(scratch, "invalid.qnt");
      const source = "module Invalid {\n";
      writeFileSync(filePath, source);

      try {
        const result = await runCliInProcess("--write", filePath);

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr.replace(filePath, "invalid.qnt")).toMatchSnapshot();
        expect(readFileSync(filePath, "utf8")).toBe(source);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    test("checks multiple files", async () => {
      const result = await runCliInProcess(
        "--check",
        "test/fixtures/module-keyword-spacing.qnt",
        "test/fixtures/module-brace-spacing.qnt",
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatchSnapshot();
    });

    test("discovers Quint files recursively", async () => {
      const scratch = mkdtempSync(join(tmpdir(), "quint-format-discovery-"));
      const nested = join(scratch, "nested");
      mkdirSync(nested);
      writeFileSync(join(scratch, "clean.qnt"), "module Clean {\n}\n");
      writeFileSync(join(nested, "dirty.qnt"), "module Dirty {}\n");
      writeFileSync(join(nested, "ignored.txt"), "module Ignored {}\n");

      try {
        const result = await runCliInProcess("--check", scratch);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.replaceAll(scratch, "fixtures")).toMatchSnapshot();
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });
  });
});
