import { type ApprovalStatus, type ApprovalStore, comparisonFingerprint } from "./approvals.js";
import { type Comparison, compareSource, failedComparison } from "./comparison.js";
import type { Formatter } from "./formatter.js";
import type { Repository } from "./repository.js";

export interface Assets {
  html: string;
  css: string;
  js: string;
}

export function startServer(
  repository: Repository,
  formatter: Formatter,
  approvals: ApprovalStore,
  assets: Assets,
  port = 4310,
) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request, server) {
      const url = new URL(request.url);
      const origin = `http://127.0.0.1:${server.port}`;
      const headers = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      };
      const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
      const compare = async (path: string) => {
        const file = await repository.read(path);
        let comparison: Comparison;
        try {
          comparison = compareSource(file.source, await formatter.format(file.path));
        } catch (error) {
          comparison = failedComparison(file.source, error);
        }
        const approvalPath = repository.approvalPath(path);
        const fingerprint = comparisonFingerprint(comparison);
        return {
          approvalPath,
          fingerprint,
          comparison: {
            ...comparison,
            approval: approvals.status(approvalPath, fingerprint),
          },
        };
      };
      if (
        url.origin !== origin ||
        (request.headers.get("origin") && request.headers.get("origin") !== origin)
      ) {
        return json({ error: "Forbidden origin" }, 403);
      }
      const route = url.pathname.slice(1);
      try {
        if (route === "api/approve" && request.method === "POST") {
          const result = await compare(url.searchParams.get("path") ?? "");
          if (result.comparison.after === null) {
            return json({ error: "A file with unavailable formatting cannot be approved" }, 409);
          }
          await approvals.approve(result.approvalPath, result.fingerprint);
          return json({ ...result.comparison, approval: "approved" satisfies ApprovalStatus });
        }
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        if (route === "api/files") {
          const files = await repository.refresh();
          const approvalStatuses: Record<string, ApprovalStatus> = {};
          const currentApprovalPaths = new Set<string>();
          for (const path of files) {
            const approvalPath = repository.approvalPath(path);
            currentApprovalPaths.add(approvalPath);
            approvalStatuses[path] = approvals.has(approvalPath)
              ? (await compare(path)).comparison.approval
              : "unreviewed";
          }
          await approvals.prune(currentApprovalPaths);
          return json({
            directory: repository.directory,
            formatter: formatter.displayPath,
            approvalFile: approvals.filePath,
            approvals: approvalStatuses,
            files,
          });
        }
        if (route === "api/compare") {
          return json((await compare(url.searchParams.get("path") ?? "")).comparison);
        }
        const asset =
          route === ""
            ? assets.html
            : route === "app.js"
              ? assets.js
              : route === "style.css"
                ? assets.css
                : undefined;
        if (asset !== undefined) {
          const type =
            route === "" ? "text/html" : route === "app.js" ? "text/javascript" : "text/css";
          return new Response(asset, {
            headers: { ...headers, "Content-Type": `${type}; charset=utf-8` },
          });
        }
        return json({ error: "Not found" }, 404);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    },
  });
  return { server, url: `http://127.0.0.1:${server.port}/` };
}
