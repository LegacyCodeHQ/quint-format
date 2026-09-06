import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Comparison } from "./comparison.js";

export type ApprovalStatus = "unreviewed" | "approved" | "changed";

interface ApprovalState {
  version: 1;
  repository: string;
  approvals: Record<string, string>;
}

export function comparisonFingerprint(
  comparison: Pick<Comparison, "before" | "after" | "error" | "mappingWarning">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        comparison.before,
        comparison.after,
        comparison.error ?? null,
        comparison.mappingWarning ?? null,
      ]),
    )
    .digest("hex");
}

export class ApprovalStore {
  private constructor(
    readonly repository: string,
    readonly filePath: string,
    private readonly approvals: Map<string, string>,
  ) {}

  static async open(repository: string, home = homedir()): Promise<ApprovalStore> {
    const canonicalRepository = await realpath(repository);
    const repositoryId = createHash("sha256").update(canonicalRepository).digest("hex");
    const filePath = join(home, ".quint-format-review", "approvals", `${repositoryId}.json`);
    let state: ApprovalState | undefined;
    try {
      state = JSON.parse(await readFile(filePath, "utf8")) as ApprovalState;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (state && (state.version !== 1 || state.repository !== canonicalRepository)) {
      throw new Error(`Invalid approval state for ${canonicalRepository}`);
    }
    return new ApprovalStore(
      canonicalRepository,
      filePath,
      new Map(Object.entries(state?.approvals ?? {})),
    );
  }

  status(path: string, fingerprint: string): ApprovalStatus {
    const approvedFingerprint = this.approvals.get(path);
    if (!approvedFingerprint) return "unreviewed";
    return approvedFingerprint === fingerprint ? "approved" : "changed";
  }

  has(path: string): boolean {
    return this.approvals.has(path);
  }

  async approve(path: string, fingerprint: string): Promise<void> {
    this.approvals.set(path, fingerprint);
    await this.save();
  }

  async unapprove(path: string): Promise<void> {
    if (!this.approvals.delete(path)) return;
    await this.save();
  }

  async prune(paths: Set<string>): Promise<void> {
    const stale = [...this.approvals.keys()].filter((path) => !paths.has(path));
    if (stale.length === 0) return;
    for (const path of stale) this.approvals.delete(path);
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const state: ApprovalState = {
      version: 1,
      repository: this.repository,
      approvals: Object.fromEntries(
        [...this.approvals.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}
