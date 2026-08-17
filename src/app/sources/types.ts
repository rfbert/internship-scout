import type { SourceKind } from "@prisma/client";

export interface SourceRow {
  id: string;
  key: string;
  name: string;
  kind: SourceKind;
  enabled: boolean;
  automated: boolean;
  priority: number;
  rateLimitMs: number;
  config: unknown;
  notes: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  /** Number of internship_sources sighting rows linked to this source. */
  sightings: number;
  /** Linked listings currently in the top 4 score bands. */
  topBandListings: number;
  /**
   * What this connector warned about on the most recent run, with the source
   * key `run.ts` prefixes stripped off. Empty for a source that said nothing.
   *
   * A connector can return zero postings without failing — a missing repo, a
   * page whose table it no longer recognises — and every one of those paths
   * logs a WARN and then updates `lastSuccessAt` anyway. Health computed from
   * the timestamps alone therefore reads OK for a source that has gone silent,
   * which is the one failure this product cannot afford to hide.
   */
  warnings: string[];
}
