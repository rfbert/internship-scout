import type { SourceKind } from "@prisma/client";
import type { ColorToken } from "@/lib/format";
import type { SourceRow } from "./types";

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  GITHUB_REPO: "GitHub list",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  SMARTRECRUITERS: "SmartRecruiters",
  WORKDAY: "Workday",
  COMPANY_PAGE: "Company page",
  URL_IMPORT: "URL import",
  CSV_IMPORT: "CSV import",
  MANUAL: "Manual",
};

/** Flatten a connector config object into short "chip" strings for display. */
export function configChips(config: unknown): string[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const chips: string[] = [];
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value.length === 0) chips.push(`${key}: —`);
      else for (const item of value) chips.push(String(item));
    } else if (value !== null && typeof value !== "object") {
      chips.push(`${key}: ${String(value)}`);
    }
  }
  return chips;
}

/* ── Health ────────────────────────────────────────────────────────────────
   Spec C7: "a status tick per source (--green OK, --ochre stale, --carmine
   failing) plus the last-success timestamp in mono".

   The tick is never the only carrier (D3): every row prints the health WORD
   next to it, and the tooltip spells out the instant behind the "3h ago". */

export type HealthCode = "OK" | "STALE" | "FAILING" | "NEVER RUN" | "STANDBY" | "OFF";

export interface Health {
  code: HealthCode;
  color: ColorToken;
  /** A full sentence for the row's `title`. */
  sentence: string;
}

/**
 * Automated connectors are fetched on every daily run, so three quiet days is
 * the point at which "it succeeded once" stops being reassurance. Manual
 * sources are never fetched on a schedule, so they are never stale — they are
 * `STANDBY` until an import flows through them.
 */
const STALE_AFTER_MS = 3 * 86_400_000;

export function sourceHealth(row: SourceRow, now: number): Health {
  const success = row.lastSuccessAt ? Date.parse(row.lastSuccessAt) : null;
  const failure = row.lastErrorAt ? Date.parse(row.lastErrorAt) : null;

  if (failure != null && (success == null || failure > success)) {
    return {
      code: "FAILING",
      color: "carmine",
      sentence: row.lastErrorMessage
        ? `Last fetch failed — ${row.lastErrorMessage}`
        : "The last fetch of this source failed.",
    };
  }
  if (!row.enabled) {
    return { code: "OFF", color: "ink-3", sentence: "Disabled — skipped by every agent run." };
  }
  if (success == null) {
    return row.automated
      ? { code: "NEVER RUN", color: "ink-3", sentence: "This connector has never fetched anything." }
      : { code: "STANDBY", color: "ink-3", sentence: "A manual source: it waits for you to import." };
  }
  if (row.automated && now - success > STALE_AFTER_MS) {
    return {
      code: "STALE",
      color: "ochre",
      sentence: "No successful fetch in the last three days — check the connector.",
    };
  }
  return { code: "OK", color: "green", sentence: "Last fetch succeeded." };
}
