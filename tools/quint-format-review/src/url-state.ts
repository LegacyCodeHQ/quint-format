const fileParameter = "file";
const viewParameter = "view";
const approvalViews: ApprovalView[] = ["all", "approved", "changed", "unreviewed"];

export type ApprovalView = "all" | "approved" | "changed" | "unreviewed";

export function filePathFromUrl(url: URL): string {
  return url.searchParams.get(fileParameter) ?? "";
}

export function urlForFile(url: URL, path: string): URL {
  const next = new URL(url);
  if (path) next.searchParams.set(fileParameter, path);
  else next.searchParams.delete(fileParameter);
  return next;
}

export function approvalViewFromUrl(url: URL): ApprovalView {
  const view = url.searchParams.get(viewParameter);
  return approvalViews.includes(view as ApprovalView) ? (view as ApprovalView) : "all";
}

export function urlForApprovalView(url: URL, view: ApprovalView): URL {
  const next = new URL(url);
  next.searchParams.set(viewParameter, view);
  return next;
}
