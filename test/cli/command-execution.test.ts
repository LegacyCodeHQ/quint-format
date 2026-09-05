import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot } from "../support/cli";

describe("command-line checker", () => {
  describe("command execution", () => {
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
    });

    test("formats one file to standard output", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "test/fixtures/compact-empty-module.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toMatchSnapshot();
      expect(result.stderr.toString()).toBe("");
    });

    test("writes one file atomically", () => {
      const scratch = mkdtempSync(join(tmpdir(), "quint-format-write-"));
      const filePath = join(scratch, "example.qnt");
      writeFileSync(filePath, "module Example {}\n");

      try {
        const result = Bun.spawnSync(["bun", "run", "src/cli.ts", "--write", filePath], {
          cwd: projectRoot,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toBe("");
        expect(result.stderr.toString()).toBe("");
        expect(readFileSync(filePath, "utf8")).toMatchSnapshot();
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    test("does not replace a file that has invalid syntax", () => {
      const scratch = mkdtempSync(join(tmpdir(), "quint-format-write-error-"));
      const filePath = join(scratch, "invalid.qnt");
      const source = "module Invalid {\n";
      writeFileSync(filePath, source);

      try {
        const result = Bun.spawnSync(["bun", "run", "src/cli.ts", "--write", filePath], {
          cwd: projectRoot,
        });

        expect(result.exitCode).toBe(2);
        expect(result.stdout.toString()).toBe("");
        expect(result.stderr.toString().replace(filePath, "invalid.qnt")).toMatchSnapshot();
        expect(readFileSync(filePath, "utf8")).toBe(source);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    test("checks multiple files", () => {
      const result = Bun.spawnSync(
        [
          "bun",
          "run",
          "src/cli.ts",
          "--check",
          "test/fixtures/module-keyword-spacing.qnt",
          "test/fixtures/module-brace-spacing.qnt",
        ],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("discovers Quint files recursively", () => {
      const scratch = mkdtempSync(join(tmpdir(), "quint-format-discovery-"));
      const nested = join(scratch, "nested");
      mkdirSync(nested);
      writeFileSync(join(scratch, "clean.qnt"), "module Clean {\n}\n");
      writeFileSync(join(nested, "dirty.qnt"), "module Dirty {}\n");
      writeFileSync(join(nested, "ignored.txt"), "module Ignored {}\n");

      try {
        const result = Bun.spawnSync(["bun", "run", "src/cli.ts", "--check", scratch], {
          cwd: projectRoot,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stdout.toString()).toBe("");
        expect(result.stderr.toString().replaceAll(scratch, "fixtures")).toMatchSnapshot();
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });
  });
});
