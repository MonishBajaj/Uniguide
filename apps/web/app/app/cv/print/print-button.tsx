"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">Print or save as PDF</button>;
}
