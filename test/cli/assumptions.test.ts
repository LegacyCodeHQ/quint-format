import { describe, expect, test } from "bun:test";
import { projectRoot } from "../support/cli";

describe("command-line checker", () => {
  describe("assumptions", () => {
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
  });
});
