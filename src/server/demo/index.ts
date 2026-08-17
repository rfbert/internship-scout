import { ApiError } from "@/server/api-helpers";

/**
 * Just enough of the environment to answer the question.
 *
 * Typed as a plain record rather than `NodeJS.ProcessEnv` so a caller — a test,
 * usually — can pass the one variable that matters instead of assembling a
 * whole process environment around it.
 */
type DemoEnv = Readonly<Record<string, string | undefined>>;

/**
 * Demo mode: this deployment is the public showcase, open to anyone, holding
 * nothing but invented data.
 *
 * The flag exists because "public demo" and "someone's real search" want
 * opposite things from the same code. A real deployment must let its owner
 * reshape the scoring weights and delete records. A public demo must not,
 * because those two powers are global — one visitor rewriting the weights
 * changes every score every later visitor sees, and one visitor clearing the
 * sample data leaves the next person looking at an empty product.
 *
 * Off by default, and only the two documented values turn it on. A blank string
 * — which is what an uncommented `DEMO_MODE=` and an unset CI variable both
 * produce — is not consent, and neither is `false`. Forgetting the variable
 * fails toward a normal app rather than toward a silently crippled one.
 */
export function isDemoMode(env: DemoEnv = process.env): boolean {
  const v = env.DEMO_MODE?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Refuse an action the public demo must not allow.
 *
 * Deliberately narrow. Accepting a listing, discarding one, moving an
 * application through the funnel, writing a note, importing a posting — all of
 * that stays open, because being able to *use* the review queue is the whole
 * reason a demo is worth deploying, and every one of those actions is scoped to
 * one record and undone by a reset. What this guards is the small set of
 * operations that are global or destructive.
 *
 * `reason` is shown to the person who tried, so write it for them.
 */
export function assertAllowedOnDemo(reason: string, env: DemoEnv = process.env): void {
  if (isDemoMode(env)) {
    throw new ApiError(reason, 403);
  }
}
