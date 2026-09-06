export function nextFileAfterRemoval(
  visibleFiles: string[],
  currentPath: string,
): string | undefined {
  const currentIndex = visibleFiles.indexOf(currentPath);
  const remainingFiles = visibleFiles.filter((path) => path !== currentPath);
  if (remainingFiles.length === 0) return undefined;
  if (currentIndex < 0) return remainingFiles[0];
  return remainingFiles[Math.min(currentIndex, remainingFiles.length - 1)];
}
