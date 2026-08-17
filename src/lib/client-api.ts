"use client";

/**
 * The single browser→API fetch helper (spec B3).
 *
 * This is the former `src/app/tracker/client-api.ts`, moved up to `src/lib` so
 * the three duplicate implementations — tracker's, `review-list.tsx`'s inline
 * `postJson`, and `sources/import-url.tsx`'s — collapse into one. The
 * `ApiResult` shape is unchanged: every route in `src/app/api/**` answers
 * `{ ok: true, data }` or `{ ok: false, error }` (see `src/server/api-helpers`),
 * and callers already branch on `.ok`.
 *
 * Integration check (Part E, step 7): this file holds the only definition, and
 * as of the plumbing pass it is also the only caller of `fetch` against the
 * app's own API. Both halves are greppable, and the sentence that used to say
 * so was truncated mid-edit — losing the commands, which were the whole point:
 *
 *     grep -rn 'fetch(`/api\|fetch("/api' src/ | grep -v client-api.ts
 *       → must return NOTHING. A hit is a component that will report a network
 *         failure in its own words instead of the app's.
 *
 *     grep -rnE 'export const post[J]son' src/
 *       → must return exactly one hit: this file. A second is the duplicate
 *         coming back.
 *
 * The bracket in that second pattern is load-bearing, not a typo: `post[J]son`
 * matches the declaration below but not this line, so the check does not count
 * its own documentation. Written the obvious way it reports two hits forever.
 * (The first pattern needs no such trick — `grep -v client-api.ts` already
 * excludes the file these comments live in.)
 */

/**
 * A discriminated union, not a bag of optionals: after `if (!res.ok) return`,
 * `res.data` is known present and `res.error` is known absent. Callers get
 * that narrowing for free instead of reaching for `!`.
 */
export type ApiResult<T = unknown> =
  | { ok: true; data: T; error?: undefined }
  | { ok: false; error: string; data?: undefined };

/**
 * What a transport failure reads as. One string, because the point of routing
 * every call through here is that a dead server, a dropped connection and a
 * rejected request are one indistinguishable condition to the reader — and the
 * nine hand-rolled call sites that used to say a bare "Network error" told them
 * less than a route's own message would have.
 */
const NETWORK_FAILURE = "Network error — is the app still running?";

async function sendJson<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: NETWORK_FAILURE };
  }
}

/**
 * The read half. It cannot route through `sendJson` — `fetch` rejects a GET
 * that carries a body — but the response contract, the narrowing and the
 * failure string are the same, which is the only reason a caller reaches for
 * this instead of `fetch`.
 */
export async function getJson<T = unknown>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url);
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: NETWORK_FAILURE };
  }
}

export const postJson = <T = unknown>(url: string, body?: unknown) =>
  sendJson<T>("POST", url, body);
export const patchJson = <T = unknown>(url: string, body?: unknown) =>
  sendJson<T>("PATCH", url, body);
export const deleteJson = <T = unknown>(url: string, body?: unknown) =>
  sendJson<T>("DELETE", url, body);
