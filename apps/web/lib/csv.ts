/** A CSV with RFC 4180 quoting. Text cells that a spreadsheet would run as a formula get a leading apostrophe. */
export function toCsv(rows: Record<string, string | number | null | undefined>[], columns: string[]): string {
  const cell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].map((l) => `${l}\r\n`).join("");
}
