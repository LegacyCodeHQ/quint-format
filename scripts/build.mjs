import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const projectRoot = new URL("../", import.meta.url);
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const git = (args, fallback) => {
  try {
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
};

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const channel = process.env.QUINT_FORMAT_BUILD_CHANNEL === "npm" ? "npm" : "dev";
const commit = (
  process.env.GITHUB_SHA || git(["rev-parse", "--short=12", "HEAD"], "unknown")
).slice(0, 12);
const dirty = channel === "dev" && git(["status", "--porcelain"], "") !== "";

run("tsc", ["--project", "tsconfig.build.json"]);
run("tsc-alias", ["--project", "tsconfig.build.json"]);
writeFileSync(
  new URL("../dist/build-info.json", import.meta.url),
  `${JSON.stringify({ version: manifest.version, channel, commit, dirty }, null, 2)}\n`,
);

console.log(
  `Built quintfmt ${manifest.version} (${channel}${channel === "dev" ? ` ${commit}${dirty ? "-dirty" : ""}` : ""})`,
);
