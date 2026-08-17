import { prisma } from "@/lib/prisma";
import { ApiError, fail, handler, ok } from "@/server/api-helpers";
import { isDemoMode } from "@/server/demo";
import { resetDemo } from "@/server/demo/reset";

/**
 * Restore the public demo to its deployed state.
 *
 * POST is the visible control any visitor can press. GET is the scheduled entry
 * point (`vercel.json` crons), because Vercel invokes cron targets with GET.
 *
 * Rebuilding the dataset re-runs the scoring engines over every posting, which
 * takes tens of seconds — well past the platform's default ceiling, hence the
 * raised duration. If it does time out, pressing it again finishes the job: the
 * seed is idempotent and the truncate is unconditional.
 */
export const maxDuration = 60;

/** A fresh reset leaves a brand-new user row, so its age *is* the reset clock. */
const COOLDOWN_MS = 60_000;

async function run(): Promise<Response> {
  if (!isDemoMode()) {
    // 404 rather than 403: on a real deployment this endpoint should not appear
    // to exist at all.
    return fail("Not found", 404);
  }

  // The control is public by design — a demo nobody can reset is a demo that
  // stays broken — so it needs some protection from being held down. The most
  // recent reset is legible from the data itself: truncate destroys the user
  // row and the seed writes a new one, so its age is when the last reset ran.
  // No extra table, and it survives a cold start, which an in-memory timestamp
  // would not.
  const user = await prisma.user.findFirst({ select: { createdAt: true } });
  if (user) {
    const age = Date.now() - user.createdAt.getTime();
    if (age < COOLDOWN_MS) {
      throw new ApiError(
        `The demo was reset ${Math.round(age / 1000)}s ago. Try again in ${Math.ceil(
          (COOLDOWN_MS - age) / 1000
        )}s.`,
        429
      );
    }
  }

  const started = Date.now();
  const { tablesCleared } = await resetDemo();
  return ok({
    reset: true,
    tablesCleared,
    tookMs: Date.now() - started,
  });
}

export const POST = handler(run);

export const GET = handler(async (req: Request) => {
  // Vercel signs cron invocations with CRON_SECRET when it is configured. When
  // it is, require it: an unauthenticated GET that truncates a database is a
  // button anyone can hold down from a script.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) return fail("Unauthorized", 401);
  }
  return run();
});
