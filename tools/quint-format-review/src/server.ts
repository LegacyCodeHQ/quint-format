import { randomBytes } from "node:crypto";
import { compareSource, failedComparison } from "./comparison.js";
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
  assets: Assets,
  port = 0,
) {
  const token = randomBytes(24).toString("hex");
  const base = `/${token}/`;
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
      if (
        url.origin !== origin ||
        (request.headers.get("origin") && request.headers.get("origin") !== origin)
      ) {
        return json({ error: "Forbidden origin" }, 403);
      }
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!url.pathname.startsWith(base)) return json({ error: "Not found" }, 404);
      const route = url.pathname.slice(base.length);
      try {
        if (route === "api/files")
          return json({
            directory: repository.directory,
            formatter: formatter.displayPath,
            files: await repository.refresh(),
          });
        if (route === "api/compare") {
          const file = await repository.read(url.searchParams.get("path") ?? "");
          try {
            return json(compareSource(file.source, await formatter.format(file.path)));
          } catch (error) {
            return json(failedComparison(file.source, error));
          }
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
  return { server, url: `http://127.0.0.1:${server.port}${base}` };
}
