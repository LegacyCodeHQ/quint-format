import { expect, test } from "bun:test";
import {
  approvalViewFromUrl,
  filePathFromUrl,
  urlForApprovalView,
  urlForFile,
} from "../src/url-state.js";

test("selected file paths round-trip through the review URL", () => {
  const url = urlForFile(new URL("http://127.0.0.1:4310/"), "spells/space ü.qnt");

  expect(url.toString()).toBe("http://127.0.0.1:4310/?file=spells%2Fspace+%C3%BC.qnt");
  expect(filePathFromUrl(url)).toBe("spells/space ü.qnt");
});

test("clearing a selected file preserves unrelated URL state", () => {
  const url = new URL("http://127.0.0.1:4310/?theme=dark&file=tree.qnt");

  expect(urlForFile(url, "").toString()).toBe("http://127.0.0.1:4310/?theme=dark");
  expect(filePathFromUrl(new URL("http://127.0.0.1:4310/"))).toBe("");
});

test("approval views round-trip through the review URL without losing the selected file", () => {
  for (const view of ["all", "approved", "changed", "unreviewed"] as const) {
    const url = urlForApprovalView(
      new URL("http://127.0.0.1:4310/?file=examples%2Fdemo.qnt"),
      view,
    );

    expect(url.searchParams.get("file")).toBe("examples/demo.qnt");
    expect(url.searchParams.get("view")).toBe(view);
    expect(approvalViewFromUrl(url)).toBe(view);
  }
});

test("missing and invalid approval views fall back to All", () => {
  expect(approvalViewFromUrl(new URL("http://127.0.0.1:4310/"))).toBe("all");
  expect(approvalViewFromUrl(new URL("http://127.0.0.1:4310/?view=surprise"))).toBe("all");
});
