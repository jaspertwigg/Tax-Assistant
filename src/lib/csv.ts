function cell(v: unknown): string {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): Blob {
  const text = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
}
