import { readFile } from "node:fs/promises";

const releaseTag = process.argv[2];
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const expectedTag = `v${packageJson.version}`;

if (releaseTag !== expectedTag) {
  console.error(
    `Release tag '${releaseTag ?? ""}' does not match package version '${expectedTag}'.`,
  );
  process.exit(1);
}

console.log(`Release tag ${releaseTag} matches package version ${packageJson.version}.`);
