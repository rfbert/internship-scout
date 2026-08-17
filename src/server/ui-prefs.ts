import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { DEFAULT_NOTATION, type NotationMode } from "@/lib/notation";

/** The two preference columns every rendered page needs, and nothing else. */
export type UiPrefs = {
  timezone: string;
  notation: NotationMode;
};

/**
 * The presentation preferences, read defensively and scoped to the user.
 *
 * Timezone and notation travel together because every page that prints a date
 * also prints a band or a sponsorship mark, and they were being fetched by two
 * different idioms — an unfiltered `userPreference.findFirst` for the zone and
 * a second unfiltered one for the notation. Unfiltered is wrong the moment a
 * second UserPreference row exists (the column is `@unique` per user, not
 * globally), and two reads of one row is a round-trip nobody asked for. This is
 * the only sanctioned way for a page to read either value; the routes that need
 * the FULL row for scoring or AI still select it themselves.
 *
 * Both columns fall back rather than throw, and the defaults are safe for both
 * failure modes: PLAIN is the default notation AND the fully-spelled-out
 * grammar, so a reader never sees an undecodable code because a query failed,
 * and DEFAULT_TIMEZONE mirrors the schema default.
 *
 *  - A database hiccup. The root layout has no `error.tsx` above it, so an
 *    unguarded throw here blanks every page in the app.
 *  - A column not existing yet (Prisma P2022). Code deploys before a migration
 *    can run — that is the ordering the host forces, not a mistake — so the app
 *    has to render correctly in the window between the two. `notationMode`
 *    post-dates the first migration and is the column that motivated the guard;
 *    selecting `timezone` alongside it now shares the same fate, which is why
 *    the fallback covers both fields rather than just one.
 *
 * The guard is cheap and permanent: it also covers a rollback to a build that
 * predates a column.
 */
export async function readUiPrefs(): Promise<UiPrefs> {
  try {
    const user = await prisma.user.findFirst({ select: { id: true } });
    const prefs = user
      ? await prisma.userPreference.findUnique({
          where: { userId: user.id },
          select: { timezone: true, notationMode: true },
        })
      : null;
    return {
      timezone: prefs?.timezone ?? DEFAULT_TIMEZONE,
      notation: prefs?.notationMode ?? DEFAULT_NOTATION,
    };
  } catch {
    return { timezone: DEFAULT_TIMEZONE, notation: DEFAULT_NOTATION };
  }
}
