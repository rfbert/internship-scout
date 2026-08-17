"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, btn, btnPrimary } from "@/components/ui";
import { postJson } from "@/lib/client-api";

const REQUIRED_HEADERS = ["companyname", "title", "locationraw", "postingurl"] as const;
const KNOWN_HEADERS: Record<string, keyof CsvRowData> = {
  companyname: "companyName",
  title: "title",
  locationraw: "locationRaw",
  postingurl: "postingUrl",
  applyurl: "applyUrl",
  description: "description",
  compensationtext: "compensationText",
};
const MAX_ROWS = 200;

interface CsvRowData {
  companyName: string;
  title: string;
  locationRaw: string;
  postingUrl: string;
  applyUrl?: string;
  description?: string;
  compensationText?: string;
}

interface PreviewRow {
  data: CsvRowData;
  problems: string[];
}

type RowResult = { row: number; ok: true; listingId: string } | { row: number; ok: false; error: string };

/** Minimal CSV parser: handles quoted fields, escaped quotes ("") and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function ImportCsvForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Map<number, RowResult> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function buildPreview() {
    setParseError(null);
    setPreview(null);
    setResults(null);
    setSubmitError(null);

    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setParseError("Paste a header row plus at least one data row.");
      return;
    }
    const header = parsed[0].map((h) => h.trim().toLowerCase());
    const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
    if (missing.length > 0) {
      setParseError(
        `Missing required column(s): ${missing.join(", ")}. Expected header: companyName,title,locationRaw,postingUrl,applyUrl,description,compensationText`
      );
      return;
    }
    const dataRows = parsed.slice(1);
    if (dataRows.length > MAX_ROWS) {
      setParseError(`Too many rows (${dataRows.length}) — the limit is ${MAX_ROWS} per import.`);
      return;
    }

    const rows: PreviewRow[] = dataRows.map((cells) => {
      const data: CsvRowData = { companyName: "", title: "", locationRaw: "", postingUrl: "" };
      header.forEach((h, idx) => {
        const field = KNOWN_HEADERS[h];
        if (!field) return;
        const value = (cells[idx] ?? "").trim();
        if (value) data[field] = value;
      });
      const problems: string[] = [];
      if (!data.companyName) problems.push("companyName missing");
      if (!data.title) problems.push("title missing");
      if (!data.locationRaw) problems.push("locationRaw missing");
      if (!data.postingUrl) problems.push("postingUrl missing");
      else if (!/^https?:\/\//i.test(data.postingUrl)) problems.push("postingUrl must be http(s)");
      if (data.applyUrl && !/^https?:\/\//i.test(data.applyUrl)) problems.push("applyUrl must be http(s)");
      return { data, problems };
    });
    setPreview(rows);
  }

  async function submit() {
    if (!preview) return;
    const validIndexes = preview
      .map((r, i) => (r.problems.length === 0 ? i : -1))
      .filter((i) => i >= 0);
    if (validIndexes.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);
    const res = await postJson<RowResult[]>("/api/import/csv", {
      rows: validIndexes.map((i) => preview[i].data),
    });
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(res.error);
      return;
    }
    // Map results (indexed within the sent array) back to preview rows.
    const map = new Map<number, RowResult>();
    for (const r of res.data) {
      const previewIndex = validIndexes[r.row];
      if (previewIndex !== undefined) map.set(previewIndex, r);
    }
    setResults(map);
    router.refresh();
  }

  const validCount = preview?.filter((r) => r.problems.length === 0).length ?? 0;
  const importedCount = results
    ? [...results.values()].filter((r): r is Extract<RowResult, { ok: true }> => r.ok).length
    : 0;

  return (
    <div className="px-4 py-4">
      <p className="text-xs text-ink-3">
        Paste a CSV export (e.g. from Handshake or a university portal). First row must be the
        header:{" "}
        {/* `break-all`: this is one unbreakable 78-character token, and in a
            narrow column it pushed the document itself sideways rather than
            wrapping. The header has to be copyable verbatim, so it wraps
            mid-token instead of truncating. */}
        <code className="break-all font-mono text-[11px]">
          companyName,title,locationRaw,postingUrl,applyUrl,description,compensationText
        </code>
        . Quoted fields are supported; max {MAX_ROWS} rows.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={`companyName,title,locationRaw,postingUrl,applyUrl,description,compensationText\nAcme,"AI PM Intern, Summer 2027","San Francisco, CA",https://example.com/job,,,"$50/hr"`}
        className="mt-3 w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-ink-3 focus:border-blue"
        aria-label="CSV content"
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={btn} onClick={buildPreview} disabled={!text.trim()}>
          Preview
        </button>
        {preview ? (
          <button
            type="button"
            className={btnPrimary}
            onClick={submit}
            disabled={submitting || validCount === 0 || results !== null}
          >
            {submitting
              ? "Importing…"
              : `Import ${validCount} row${validCount === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>
      {parseError ? <p className="mt-2 text-xs text-carmine">{parseError}</p> : null}
      {submitError ? <p className="mt-2 text-xs text-carmine">{submitError}</p> : null}
      {results ? (
        <p className="mt-2 text-xs text-green">
          Done — {importedCount} imported, {results.size - importedCount} failed.{" "}
          <Link href="/review" className="underline">
            Open the review queue
          </Link>
          .
        </p>
      ) : null}

      {preview ? (
        <div className="mt-3 overflow-x-auto rounded-md border border-rule">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-rule text-left text-xs text-ink-3">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => {
                const result = results?.get(i);
                return (
                  <tr key={i} className="border-b border-rule last:border-b-0 align-top">
                    <td className="px-3 py-2 tabular-nums text-ink-3">{i + 1}</td>
                    <td className="px-3 py-2">{row.data.companyName || "—"}</td>
                    <td className="px-3 py-2">{row.data.title || "—"}</td>
                    <td className="px-3 py-2">{row.data.locationRaw || "—"}</td>
                    <td className="max-w-56 truncate px-3 py-2 font-mono text-[11px] text-ink-3">
                      {row.data.postingUrl || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.problems.length > 0 ? (
                        <span className="text-xs text-carmine">
                          skipped: {row.problems.join("; ")}
                        </span>
                      ) : result ? (
                        result.ok ? (
                          <Badge tone="success">Imported</Badge>
                        ) : (
                          <span className="text-xs text-carmine">{result.error}</span>
                        )
                      ) : (
                        <Badge tone="neutral">Ready</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
