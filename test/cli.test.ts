import { describe, expect, test } from "bun:test";
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
});
