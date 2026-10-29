/** 6.4 Portfolio: what can be uploaded, and how items are ordered. The bucket enforces the same limits. */
export const PORTFOLIO_BUCKET = "portfolios";
export const MAX_BYTES = 10 * 1024 * 1024;
export const MIME_EXT = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" } as const;
export type PortfolioMime = keyof typeof MIME_EXT;
/** How long a share link works. */
export const SHARE_SECONDS = 7 * 24 * 60 * 60;

export function fileProblem(file: { type: string; size: number }): string | null {
  if (!(file.type in MIME_EXT)) return "Upload a PNG, JPEG or PDF.";
  if (file.size > MAX_BYTES) return "That file is over 10 MB. Compress it or upload a shorter PDF.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/** Objects live under the owner's folder with a random name, so names never leak titles. */
export function objectPath(userId: string, mime: PortfolioMime, id: string): string {
  return `${userId}/${id}.${MIME_EXT[mime]}`;
}

/** New sort values after moving one item up or down; unchanged at either end. */
export function moved<T extends { id: string }>(items: T[], id: string, direction: "up" | "down"): { id: string; sort: number }[] {
  const order = items.map((i) => i.id);
  const from = order.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= order.length) return order.map((x, sort) => ({ id: x, sort }));
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order.map((x, sort) => ({ id: x, sort }));
}
