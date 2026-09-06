#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Repository } from "./repository.js";
import { startServer } from "./server.js";

declare const REVIEW_HTML: string;
declare const REVIEW_CSS: string;
declare const REVIEW_JS: string;

function openBrowser(url: string) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { stdio: "ignore" });
  child.on("error", () =>
    console.error("Could not open the browser. Open the URL above manually."),
  );
  child.on("exit", (code) => {
    if (code) console.error("Could not open the browser. Open the URL above manually.");
  });
}

try {
  let directory = process.cwd();
  let pathProvided = false;
  let browser = true;
  let port = 0;
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: quint-format-review [directory] [--no-open] [--port <0-65535>]\n\nReview .qnt files beneath a Git working directory. No files are modified.\nDefaults: current directory, automatic browser launch, available local port.\nRequires Bun and Git. Press Ctrl+C to stop.",
    );
  } else {
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === "--no-open") browser = false;
      else if (arg === "--port") {
        const value = args[++index];
        if (!value || !/^\d+$/.test(value) || Number(value) > 65535)
          throw new Error("--port requires an integer from 0 to 65535");
        port = Number(value);
      } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
      else if (pathProvided) throw new Error("Supply only one review directory");
      else {
        directory = resolve(arg);
        pathProvided = true;
      }
    }
    const repository = await Repository.open(directory);
    const { server, url } = startServer(
      repository,
      { html: REVIEW_HTML, css: REVIEW_CSS, js: REVIEW_JS },
      port,
    );
    console.log(
      `Quint Format Review\nDirectory: ${repository.directory}\n${url}\nRead-only preview. Press Ctrl+C to stop.`,
    );
    const stop = () => {
      server.stop(true);
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    if (browser) openBrowser(url);
  }
} catch (error) {
  console.error(`quint-format-review: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
