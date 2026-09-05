import { describe, expect, test } from "bun:test";
import { projectRoot } from "../support/cli";

describe("command-line checker", () => {
  describe("destructuring patterns", () => {
    test("reports noncanonical tuple-pattern formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/tuple-pattern.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical tuple-pattern comment formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/tuple-pattern-comment.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });

    test("reports noncanonical record-pattern formatting", () => {
      const result = Bun.spawnSync(
        ["bun", "run", "src/cli.ts", "--check", "test/fixtures/record-pattern.qnt"],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toMatchSnapshot();
    });
  });
});
