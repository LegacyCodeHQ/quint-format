import { fileURLToPath } from "node:url";
import { runCli } from "@/cli.js";

export const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export async function runCliInProcess(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: (value) => {
      stderr += value;
    },
  });

  return { exitCode, stdout, stderr };
}
