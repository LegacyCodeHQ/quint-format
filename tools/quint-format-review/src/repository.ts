import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface RepositoryFile {
  path: string;
  source: string;
}

export class Repository {
  private files = new Set<string>();

  private constructor(readonly directory: string) {}

  static async open(directory: string): Promise<Repository> {
    const canonical = await realpath(directory);
    await exec("git", ["-C", canonical, "rev-parse", "--show-toplevel"]);
    const repository = new Repository(canonical);
    await repository.refresh();
    return repository;
  }

  async refresh(): Promise<string[]> {
    const { stdout } = await exec(
      "git",
      [
        "-C",
        this.directory,
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ".",
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    const candidates = [...new Set(stdout.split("\0").filter((name) => name.endsWith(".qnt")))];
    const files: string[] = [];
    for (const name of candidates) {
      try {
        await this.safePath(name);
        files.push(name);
      } catch {
        // Deleted tracked files, symlinks, and non-regular entries are not reviewable.
      }
    }
    files.sort((a, b) => a.localeCompare(b));
    this.files = new Set(files);
    return files;
  }

  private async safePath(name: string): Promise<string> {
    const path = resolve(this.directory, name);
    const canonical = await realpath(path);
    const rel = relative(this.directory, canonical);
    if (isAbsolute(name) || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error("File is outside the review directory");
    }
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || canonical !== path) {
      throw new Error("Only regular files without symlink components can be reviewed");
    }
    return path;
  }

  async read(name: string): Promise<RepositoryFile> {
    if (!this.files.has(name)) throw new Error("Unknown .qnt file; refresh the file list");
    const path = await this.safePath(name);
    if ((await lstat(path)).size > MAX_FILE_BYTES)
      throw new Error("File exceeds the 2 MiB review limit");
    return { path, source: await readFile(path, "utf8") };
  }
}
