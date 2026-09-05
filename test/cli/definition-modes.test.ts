import { describe, expect, test } from "bun:test";
import { projectRoot } from "../support/cli";

describe("command-line checker", () => {
  describe("definition modes", () => {
    test("reports noncanonical pure-definition formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/pure-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical pure-value formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/pure-value-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical action formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/action-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical definition-body comment formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/definition-body-comment.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical run formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/run-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical temporal formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/temporal-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical nondet formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/nondet-definition.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical empty parameter lists", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/empty-parameter-lists.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical rich definitions across every mode", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/definition-matrix.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });
  });
});
