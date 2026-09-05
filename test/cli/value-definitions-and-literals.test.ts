import { describe, expect, test } from "bun:test";
import { projectRoot } from "../support/cli";

describe("command-line checker", () => {
  describe("value definitions and literals", () => {
    test("reports an unindented integer value definition", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/value-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports an optional value semicolon", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/value-semicolon.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports an unindented Boolean value definition", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/boolean-value-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports an unindented string value definition", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/string-value-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical typed value formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/typed-value-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical addition formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/addition-expression.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical identifier value formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/identifier-value-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical unit-literal formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/unit-literal.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical list-literal formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/list-literal.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical tuple-literal formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/tuple-literal.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical record-literal formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/record-literal.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical record-spread formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/record-spread.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical commented-record formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/commented-record.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });
  });
});
