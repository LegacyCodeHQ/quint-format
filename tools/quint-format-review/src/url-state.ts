const fileParameter = "file";

export function filePathFromUrl(url: URL): string {
  return url.searchParams.get(fileParameter) ?? "";
}

export function urlForFile(url: URL, path: string): URL {
  const next = new URL(url);
  if (path) next.searchParams.set(fileParameter, path);
  else next.searchParams.delete(fileParameter);
  return next;
}
