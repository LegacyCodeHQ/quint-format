import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
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

  test("packs the complete compiled distribution", () => {
    const scratch = mkdtempSync(join(tmpdir(), "quint-format-pack-"));
    const build = Bun.spawnSync(["bun", "run", "build"], { cwd: projectRoot });

    try {
      expect(build.exitCode).toBe(0);
      const packed = Bun.spawnSync(
        [
          "npm",
          "pack",
          "--dry-run",
          "--json",
          "--ignore-scripts",
          "--cache",
          join(scratch, "npm-cache"),
        ],
        { cwd: projectRoot },
      );

      expect(packed.exitCode).toBe(0);
      const [manifest] = JSON.parse(packed.stdout.toString());
      const packedDistribution = manifest.files
        .map(({ path }: { path: string }) => path)
        .filter((path: string) => path.startsWith("dist/"))
        .sort();
      const builtDistribution = [
        ...new Bun.Glob("dist/**/*").scanSync({ cwd: projectRoot, onlyFiles: true }),
      ].sort();

      expect(packedDistribution).toEqual(builtDistribution);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
