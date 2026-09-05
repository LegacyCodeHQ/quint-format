import { describe, expect, test } from "bun:test";
import { projectRoot } from "../support/cli";

describe("command-line checker", () => {
  describe("declarations and type expressions", () => {
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

    test("reports noncanonical Set-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/set-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical tuple-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/tuple-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical record-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/record-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical commented-record-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/record-type-comment.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical empty-record-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/empty-record-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical open-record-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/open-record-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical function-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/function-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical operator-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/operator-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical zero-parameter-operator-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/zero-parameter-operator-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical direct-operator-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/direct-operator-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical parenthesized-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/parenthesized-type.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical unit-type formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/unit-type.qnt"],
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
  });
});
