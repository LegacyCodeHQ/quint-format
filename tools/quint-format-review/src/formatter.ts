import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

function findExecutable(command: string): string | undefined {
  const directories =
    isAbsolute(command) || command.includes("/") || command.includes("\\")
      ? [""]
      : (process.env.PATH ?? "").split(delimiter);
  const extensions =
    process.platform === "win32"
      ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")]
      : [""];
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = directory
        ? join(directory, `${command}${extension}`)
        : `${command}${extension}`;
      try {
        accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Continue through PATH entries that do not contain an executable match.
      }
    }
  }
  return undefined;
}

export interface Formatter {
  readonly displayPath: string;
  format(filePath: string): Promise<string>;
}

export class PathFormatter implements Formatter {
  private constructor(
    private readonly command: string,
    readonly displayPath: string,
  ) {}

  static discover(command = "quintfmt"): PathFormatter {
    const resolved = findExecutable(command);
    if (!resolved) {
      throw new Error(
        `Cannot find '${command}' in PATH. Install or build the formatter and add its binary directory to PATH.`,
      );
    }
    return new PathFormatter(command, resolved);
  }

  async format(filePath: string): Promise<string> {
    try {
      const { stdout } = await exec(this.command, [filePath], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 30_000,
      });
      return stdout;
    } catch (error) {
      const result = error as Error & { stderr?: string; killed?: boolean };
      if (result.killed) throw new Error(`${this.displayPath} exceeded the 30-second limit`);
      const detail = result.stderr?.trim() || result.message;
      throw new Error(`${this.displayPath} failed: ${detail}`);
    }
  }
}
