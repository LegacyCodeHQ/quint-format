import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

describe("command-line checker", () => {
  test("reports a compact empty module", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/compact-empty-module.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports a missing module brace at end of file", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/missing-module-brace.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports noncanonical spacing after the module keyword", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/module-keyword-spacing.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports missing spacing before the module brace", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/module-brace-spacing.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports an excess final newline", () => {
    const scratch = mkdtempSync(join(tmpdir(), "quint-format-test-"));
    const filePath = join(scratch, "extra-final-newline.qnt");

    try {
      writeFileSync(filePath, "module Example {\n}\n\n");
      const result = Bun.spawnSync(["bun", "run", "src/cli.ts", "--check", filePath], {
        cwd: projectRoot,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(
        result.stderr.toString().replace(filePath, "extra-final-newline.qnt"),
      ).toMatchSnapshot();
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("reports an unindented module declaration", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/variable-indentation.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports missing spacing after a type colon", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/type-colon-spacing.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports whitespace before a type colon", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/before-type-colon.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports noncanonical spacing after var", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/variable-keyword-spacing.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports an unindented constant declaration", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/constant-declaration.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports adjacent declarations on the same line", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/declaration-line-break.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports an unindented assumption", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/assumption-declaration.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports noncanonical spacing around assumption equals", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/assumption-equals-spacing.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });

  test("reports an unindented integer value definition", () => {
    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "--check", "test/fixtures/value-definition.qnt"],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toMatchSnapshot();
  });
});
