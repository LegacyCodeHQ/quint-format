import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));

function checkReleaseTag(tag: string) {
  return Bun.spawnSync(["node", "scripts/check-release-version.mjs", tag], {
    cwd: projectRoot,
  });
}

describe("release version guard", () => {
  test("accepts a tag matching the package version", () => {
    const tag = `v${packageJson.version}`;
    const result = checkReleaseTag(tag);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(
      `Release tag ${tag} matches package version ${packageJson.version}.\n`,
    );
    expect(result.stderr.toString()).toBe("");
  });

  test("rejects a tag that does not match the package version", () => {
    const result = checkReleaseTag("v9.9.9");

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe(
      `Release tag 'v9.9.9' does not match package version 'v${packageJson.version}'.\n`,
    );
  });
});
