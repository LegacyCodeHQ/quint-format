import { readFileSync } from "node:fs";

export interface BuildInfo {
  version: string;
  channel: "dev" | "npm";
  commit: string;
  dirty: boolean;
}

function readBuildInfo(): BuildInfo {
  try {
    return JSON.parse(readFileSync(new URL("./build-info.json", import.meta.url), "utf8"));
  } catch {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    return { version: manifest.version, channel: "dev", commit: "unknown", dirty: true };
  }
}

export function formatVersion(info: BuildInfo = readBuildInfo()): string {
  if (info.channel === "npm") return `quintfmt ${info.version}`;
  const dirty = info.dirty ? "-dirty" : "";
  return `quintfmt ${info.version} (dev ${info.commit}${dirty})`;
}
