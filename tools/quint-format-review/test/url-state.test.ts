import { expect, test } from "bun:test";
import { filePathFromUrl, urlForFile } from "../src/url-state.js";

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
