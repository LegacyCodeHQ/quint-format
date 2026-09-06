import type { Comparison, NodePair, SourceRange } from "../comparison.js";
import { markdownComparison, selectionRanges } from "../selection.js";

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing element ${id}`);
  return result as T;
}
const before = element<HTMLPreElement>("before");
const after = element<HTMLPreElement>("after");
const copy = element<HTMLButtonElement>("copy");
const clear = element<HTMLButtonElement>("clear");
const filter = element<HTMLInputElement>("filter");
const tree = element("tree");
const notice = element("notice");
const panes = { before, after };
const scrolls = { before: element("before-scroll"), after: element("after-scroll") };
let files: string[] = [];
let currentPath = "";
let comparison: Comparison | undefined;
let selected: NodePair | undefined;
let requestId = 0;

async function api<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, window.location.href));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed: ${response.status}`);
  return data;
}

function showNotice(message: string, error = false) {
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle("error", error);
}

function renderTree() {
  tree.replaceChildren();
  const visible = files.filter((path) => path.toLowerCase().includes(filter.value.toLowerCase()));
  element("file-count").textContent = `${visible.length} OF ${files.length} QUINT FILES`;
  const directories = new Map<string, HTMLElement>([["", tree]]);
  for (const path of visible) {
    const segments = path.split("/");
    let prefix = "";
    let parent: HTMLElement = tree;
    for (const segment of segments.slice(0, -1)) {
      prefix += `${segment}/`;
      let directory = directories.get(prefix);
      if (!directory) {
        const details = document.createElement("details");
        details.open = true;
        const summary = document.createElement("summary");
        summary.textContent = segment;
        details.append(summary);
        parent.append(details);
        directory = details;
        directories.set(prefix, directory);
      }
      parent = directory;
    }
    const button = document.createElement("button");
    button.className = "file";
    button.textContent = segments[segments.length - 1];
    button.title = path;
    button.setAttribute("aria-current", String(path === currentPath));
    button.addEventListener("click", () => void loadFile(path));
    parent.append(button);
  }
  if (!visible.length)
    tree.textContent = files.length
      ? "No matching files."
      : "No .qnt files found beneath this directory.";
}

function syntaxClass(type: string) {
  if (type.includes("comment")) return "syntax-comment";
  if (type.includes("string")) return "syntax-string";
  if (type.includes("int") || type.includes("number")) return "syntax-number";
  if (
    [
      "module",
      "val",
      "def",
      "pure",
      "action",
      "run",
      "type",
      "const",
      "var",
      "assume",
      "import",
      "export",
      "if",
      "else",
      "match",
      "all",
      "any",
      "nondet",
      "true",
      "false",
    ].includes(type)
  )
    return "syntax-keyword";
  return "";
}

function renderSource(side: "before" | "after", source: string, nodes: NodePair[]) {
  const target = panes[side];
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const node of nodes
    .filter((node) => node.token)
    .sort((a, b) => a[side].start - b[side].start)) {
    const { start, end } = node[side];
    if (start < offset) continue;
    fragment.append(document.createTextNode(source.slice(offset, start)));
    const span = document.createElement("span");
    span.className = syntaxClass(node.type);
    span.dataset.start = String(start);
    span.dataset.end = String(end);
    span.textContent = source.slice(start, end);
    fragment.append(span);
    offset = end;
  }
  fragment.append(document.createTextNode(source.slice(offset)));
  target.replaceChildren(fragment);
  element(`${side}-lines`).textContent = source
    ? Array.from({ length: source.split("\n").length }, (_, index) => index + 1).join("\n")
    : "";
  scrolls[side].scrollTo(0, 0);
}

function domRange(target: HTMLElement, sourceRange: SourceRange): Range {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let startSet = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (!startSet && sourceRange.start <= offset + length) {
      range.setStart(node, Math.max(0, sourceRange.start - offset));
      startSet = true;
    }
    if (startSet && sourceRange.end <= offset + length) {
      range.setEnd(node, Math.max(0, sourceRange.end - offset));
      return range;
    }
    offset += length;
  }
  range.selectNodeContents(target);
  return range;
}

function drawSelection() {
  CSS.highlights?.delete("linked");
  for (const side of ["before", "after"] as const) {
    for (const token of panes[side].querySelectorAll<HTMLElement>("span[data-start]")) {
      token.classList.toggle(
        "linked-token",
        !!selected &&
          Number(token.dataset.start) < selected[side].end &&
          Number(token.dataset.end) > selected[side].start,
      );
    }
  }
  clear.disabled = !selected;
  if (!selected) {
    element("selection-info").textContent =
      "Click a token or select code to trace it across both panels.";
    copy.textContent = "Copy before & after";
    return;
  }
  const ranges = [domRange(before, selected.before), domRange(after, selected.after)];
  if (typeof Highlight !== "undefined" && CSS.highlights)
    CSS.highlights.set("linked", new Highlight(...ranges));
  element("selection-info").textContent =
    `${selected.type} · Before ${locationText(comparison?.before ?? "", selected.before)} → After ${locationText(comparison?.after ?? "", selected.after)}`;
  copy.textContent = "Copy selected before & after";
}

function locationText(source: string, range: SourceRange) {
  const prefix = source.slice(0, range.start);
  const lines = prefix.split("\n");
  return `${lines.length}:${lines[lines.length - 1].length + 1}`;
}

async function loadFile(path: string) {
  const id = ++requestId;
  currentPath = path;
  comparison = undefined;
  selected = undefined;
  drawSelection();
  copy.disabled = true;
  element("copy-state").textContent = "Markdown export";
  renderTree();
  element("filename").textContent = path;
  element("filename").title = path;
  element("file-state").textContent = "Loading comparison…";
  showNotice("");
  renderSource("before", "", []);
  renderSource("after", "", []);
  try {
    const data = await api<Comparison>(`api/compare?path=${encodeURIComponent(path)}`);
    if (id !== requestId) return;
    comparison = data;
    renderSource("before", data.before, data.nodes);
    renderSource("after", data.after ?? "", data.nodes);
    copy.disabled = data.after === null;
    element("file-state").textContent = data.error
      ? "Formatting unavailable"
      : data.changed
        ? "Formatting changes · Preview only"
        : "Already formatted · No changes";
    showNotice(data.error ?? data.mappingWarning ?? "", !!data.error);
  } catch (error) {
    if (id !== requestId) return;
    element("file-state").textContent = "Unable to load file";
    showNotice(String(error instanceof Error ? error.message : error), true);
  }
}

function textOffset(target: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(target);
  range.setEnd(node, offset);
  return range.toString().length;
}

function readSelection(side: "before" | "after") {
  const selection = window.getSelection();
  if (!comparison?.nodes.length || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const target = panes[side];
  if (!target.contains(range.startContainer) || !target.contains(range.endContainer)) return;
  selected = selectionRanges(
    comparison.nodes,
    textOffset(target, range.startContainer, range.startOffset),
    textOffset(target, range.endContainer, range.endOffset),
    side,
  );
  drawSelection();
  if (selected) {
    const other = side === "before" ? "after" : "before";
    const rect = domRange(panes[other], selected[other]).getBoundingClientRect();
    const viewport = scrolls[other].getBoundingClientRect();
    if (rect.top < viewport.top || rect.bottom > viewport.bottom)
      scrolls[other].scrollTop += rect.top - viewport.top - viewport.height / 3;
  }
}

for (const side of ["before", "after"] as const) {
  panes[side].addEventListener("pointerup", () => readSelection(side));
  panes[side].addEventListener("keyup", () => readSelection(side));
}

let scrollOwner: "before" | "after" | undefined;
for (const side of ["before", "after"] as const) {
  const scroller = scrolls[side];
  for (const event of ["pointerenter", "pointerdown", "wheel", "focusin"])
    scroller.addEventListener(event, () => {
      scrollOwner = side;
    });
  scroller.addEventListener("scroll", () => {
    if (scrollOwner !== side || !element<HTMLInputElement>("sync").checked) return;
    const other = side === "before" ? "after" : "before";
    const target = scrolls[other];
    const source = comparison?.[side];
    const destination = comparison?.[other];
    if (source && destination && comparison) {
      const line = Math.max(0, Math.floor((scroller.scrollTop - 18) / 23));
      const offset = source
        .split("\n")
        .slice(0, line)
        .reduce((sum, text) => sum + text.length + 1, 0);
      const anchor = comparison.nodes
        .filter((node) => node.token && node[side].start >= offset)
        .sort((a, b) => a[side].start - b[side].start)[0];
      if (anchor) {
        const sourceLine = source.slice(0, anchor[side].start).split("\n").length - 1;
        const targetLine = destination.slice(0, anchor[other].start).split("\n").length - 1;
        target.scrollTop = targetLine * 23 + (scroller.scrollTop - sourceLine * 23);
      } else
        target.scrollTop =
          (scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight)) *
          (target.scrollHeight - target.clientHeight);
    }
    target.scrollLeft = scroller.scrollLeft;
  });
}

clear.addEventListener("click", () => {
  selected = undefined;
  window.getSelection()?.removeAllRanges();
  drawSelection();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clear.click();
});
copy.addEventListener("click", async () => {
  if (!comparison || comparison.after === null) return;
  const original = selected
    ? comparison.before.slice(selected.before.start, selected.before.end)
    : comparison.before;
  const formatted = selected
    ? comparison.after.slice(selected.after.start, selected.after.end)
    : comparison.after;
  try {
    await navigator.clipboard.writeText(markdownComparison(original, formatted));
    element("copy-state").textContent = selected
      ? "Selected code copied as Markdown"
      : "Whole file copied as Markdown";
  } catch {
    showNotice(
      "Clipboard access was denied. Allow clipboard access for this local page and try again.",
      true,
    );
  }
});
filter.addEventListener("input", renderTree);

async function refresh() {
  const button = element<HTMLButtonElement>("refresh");
  button.disabled = true;
  try {
    const data = await api<{ directory: string; files: string[] }>("api/files");
    files = data.files;
    element("directory").textContent = data.directory;
    element("directory").title = data.directory;
    renderTree();
    if (currentPath && files.includes(currentPath)) await loadFile(currentPath);
    else if (files.length) await loadFile(files[0]);
    else {
      ++requestId;
      currentPath = "";
      comparison = undefined;
      selected = undefined;
      copy.disabled = true;
      drawSelection();
      renderSource("before", "", []);
      renderSource("after", "", []);
      element("filename").textContent = "No Quint files";
      element("file-state").textContent = "No .qnt files found";
      showNotice(
        "Add a .qnt file beneath this directory, then refresh. Ignored files are excluded.",
      );
    }
  } catch (error) {
    showNotice(String(error instanceof Error ? error.message : error), true);
  } finally {
    button.disabled = false;
  }
}
element("refresh").addEventListener("click", () => void refresh());
void refresh();
