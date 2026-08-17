// Shared between the server page and the client filter bar. Must stay outside
// any "use client" module: client exports reach server components as proxies
// in Next 16, which crashes ARCHIVED_STATES.includes() at render.
export const ARCHIVED_STATES = [
  "DISCARDED",
  "MARKED_INELIGIBLE",
  "MARKED_DUPLICATE",
  "ALREADY_APPLIED",
] as const;

export type ArchivedState = (typeof ARCHIVED_STATES)[number];
