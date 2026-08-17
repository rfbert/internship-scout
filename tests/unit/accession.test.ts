import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── No database, ever ─────────────────────────────────────────────────────
   src/server/accession.ts imports the real Prisma client at module scope, and
   the local .env points at production. The client module is replaced outright
   so nothing is ever constructed, let alone connected.

   The stub is not a no-op: it applies the `where`, `orderBy` and `select` it is
   handed to an in-memory table. That is deliberate. accessionMap() delegates
   ALL of its ordering and ALL of its row selection to the database, so a stub
   that ignored those arguments would pass no matter what query the module
   issued — which is the only interesting thing it does. */

type Row = {
  id: string;
  userId: string;
  createdAt: Date;
  deletedAt: Date | null;
};

type FindManyArgs = {
  where?: { userId?: string; deletedAt?: Date | null };
  select?: Record<string, boolean>;
  orderBy?: Array<Record<string, "asc" | "desc">>;
};

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn<(args: FindManyArgs) => Promise<Array<Record<string, unknown>>>>(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { application: { findMany } } }));

const { accessionMap, formatAccession, formatQueueNo } = await import("@/server/accession");

const sortKey = (row: Row, key: string): string | number =>
  key === "createdAt" ? row.createdAt.getTime() : String(row[key as keyof Row] ?? "");

/** Stands in for the table `accessionMap` queries, honouring the query it sends. */
function stubTable(rows: Row[]) {
  findMany.mockImplementation(async (args) => {
    const where = args.where ?? {};
    const matched = rows.filter((row) => {
      if (where.userId !== undefined && row.userId !== where.userId) return false;
      // Only applied if the module actually asks for it — which it must not.
      if ("deletedAt" in where && where.deletedAt === null && row.deletedAt !== null) return false;
      return true;
    });

    const orderBy = args.orderBy ?? [];
    const ordered = [...matched].sort((a, b) => {
      for (const clause of orderBy) {
        const [key, direction] = Object.entries(clause)[0];
        const av = sortKey(a, key);
        const bv = sortKey(b, key);
        if (av !== bv) return (av < bv ? -1 : 1) * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });

    const fields = Object.entries(args.select ?? {})
      .filter(([, wanted]) => wanted)
      .map(([field]) => field);
    return ordered.map((row) =>
      Object.fromEntries(fields.map((field) => [field, row[field as keyof Row]]))
    );
  });
}

const USER = "user_demo";

/** A row created `minute` minutes after the epoch of this fixture. */
const row = (id: string, minute: number, opts: Partial<Row> = {}): Row => ({
  id,
  userId: USER,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
  deletedAt: null,
  ...opts,
});

beforeEach(() => {
  findMany.mockReset();
});

describe("numbering an empty archive", () => {
  it("returns an empty map rather than a map of one placeholder", () => {
    stubTable([]);
    return expect(accessionMap(USER)).resolves.toEqual(new Map());
  });

  it("still asks the database exactly once", async () => {
    stubTable([]);
    await accessionMap(USER);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe("how the ordinals run", () => {
  it("gives the very first record A-0001, not A-0000", async () => {
    stubTable([row("only", 0)]);
    expect(await accessionMap(USER)).toEqual(new Map([["only", "A-0001"]]));
  });

  it("numbers in creation order, oldest first", async () => {
    // Deliberately inserted newest-first: the order the rows arrive in must
    // not be the order they are numbered in.
    stubTable([row("c", 20), row("a", 0), row("b", 10)]);
    expect([...(await accessionMap(USER))]).toEqual([
      ["a", "A-0001"],
      ["b", "A-0002"],
      ["c", "A-0003"],
    ]);
  });

  it("runs consecutively with no gaps, however many records there are", async () => {
    stubTable(Array.from({ length: 25 }, (_, i) => row(`r${i}`, i)));
    const numbers = [...(await accessionMap(USER)).values()];
    expect(numbers).toHaveLength(25);
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => formatAccession(i + 1)));
    expect(new Set(numbers).size).toBe(25); // an identity that repeats is not one
  });

  it("keys the map by application id", async () => {
    stubTable([row("cuid_one", 0), row("cuid_two", 5)]);
    const map = await accessionMap(USER);
    expect(map.get("cuid_one")).toBe("A-0001");
    expect(map.get("cuid_two")).toBe("A-0002");
    expect(map.get("never_seen")).toBeUndefined();
  });
});

/* ── Position, not rank ────────────────────────────────────────────────────
   Worth being explicit about, because the shape of the code invites the wrong
   mental model: this is NOT a rank over `createdAt`, dense or otherwise. It is
   the row's position in an ordered result set. Two records created in the same
   millisecond are two records and get two numbers; nothing is ever shared and
   nothing is ever skipped. Seeded and bulk-imported rows land on identical
   timestamps routinely, so this is the common case, not a corner. */
describe("records created at the very same instant", () => {
  /** The fixture epoch itself — `row(id, 0)` already lands here. */
  const SAME = new Date(Date.UTC(2026, 0, 1, 0, 0));

  it("gets each one its own consecutive number instead of sharing one", async () => {
    stubTable([
      row("b", 0, { createdAt: SAME }),
      row("a", 0, { createdAt: SAME }),
      row("c", 0, { createdAt: SAME }),
    ]);
    expect([...(await accessionMap(USER))]).toEqual([
      ["a", "A-0001"],
      ["b", "A-0002"],
      ["c", "A-0003"],
    ]);
  });

  it("does not skip the number after a tie the way competition rank would", async () => {
    stubTable([
      row("a", 0, { createdAt: SAME }),
      row("b", 0, { createdAt: SAME }),
      row("later", 60),
    ]);
    // Competition rank would make this A-0003; dense rank would make it A-0002.
    // It is neither: it is the third row, so it is A-0003 for that reason alone.
    expect((await accessionMap(USER)).get("later")).toBe("A-0003");
  });

  // The `id` leg of the sort is what makes a same-instant tie resolve the same
  // way on every request. Drop it and the database is free to return those two
  // rows in either order, so an accession number would change between page
  // loads — and a number that moves is not an identity.
  it("breaks the tie on id, so the same tie resolves the same way every time", async () => {
    const rows = [row("zzz", 0, { createdAt: SAME }), row("aaa", 0, { createdAt: SAME })];
    stubTable(rows);
    const first = await accessionMap(USER);
    stubTable([...rows].reverse()); // same rows, opposite arrival order
    const second = await accessionMap(USER);

    expect(first.get("aaa")).toBe("A-0001");
    expect(first).toEqual(second);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });
});

/* ── The guarantees the module's own docblock makes ────────────────────────
   Each of these is a promise printed in the UI or in the Settings copy. They
   are all invisible when broken: numbers do not throw, they just quietly
   become someone else's. */
describe("what must never renumber an existing record", () => {
  const ARCHIVE = [row("first", 0), row("second", 10), row("third", 20)];

  it("does not filter out soft-deleted rows", async () => {
    stubTable(ARCHIVE);
    await accessionMap(USER);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({ userId: USER });
    expect(where).not.toHaveProperty("deletedAt");
  });

  // Removing a record from the tracker is a soft delete. If the query grew a
  // `deletedAt: null` filter, withdrawing A-0002 would silently promote every
  // record after it — the archive would renumber itself behind the reader.
  it("holds every later number when a record is removed from the tracker", async () => {
    stubTable(ARCHIVE);
    const before = await accessionMap(USER);

    const withdrawn = ARCHIVE.map((r) =>
      r.id === "second" ? { ...r, deletedAt: new Date(Date.UTC(2026, 5, 1)) } : r
    );
    stubTable(withdrawn);
    const after = await accessionMap(USER);

    expect(after).toEqual(before);
    expect(after.get("third")).toBe("A-0003");
  });

  it("gives a restored record the number it had before", async () => {
    stubTable(ARCHIVE.map((r) => ({ ...r, deletedAt: new Date(Date.UTC(2026, 5, 1)) })));
    const whileRemoved = await accessionMap(USER);
    stubTable(ARCHIVE);
    expect(await accessionMap(USER)).toEqual(whileRemoved);
  });

  // Stage moves, re-accepts, re-scores and re-analysis all write to the row
  // without touching `createdAt`, which is why none of them can move a number.
  it("ignores every column except createdAt and id", async () => {
    stubTable(ARCHIVE);
    const before = await accessionMap(USER);

    stubTable(ARCHIVE.map((r) => ({ ...r, deletedAt: null, userId: USER })));
    expect(await accessionMap(USER)).toEqual(before);

    // Only `id` and `createdAt` are ever read off a row, so the query has no
    // business selecting anything else — and must not select `createdAt` and
    // re-sort in JS, which would put a second ordering rule in a second place.
    expect(findMany.mock.calls[0][0].select).toEqual({ id: true });
  });

  // A second user's rows entering the set would shift this user's numbers by
  // however many of them sort earlier.
  it("counts only the addressed user's records", async () => {
    stubTable([
      row("mine_early", 0),
      row("theirs", 5, { userId: "someone_else" }),
      row("mine_late", 10),
    ]);
    const map = await accessionMap(USER);
    expect(map.get("mine_early")).toBe("A-0001");
    expect(map.get("mine_late")).toBe("A-0002"); // not A-0003
    expect(map.has("theirs")).toBe(false);
    expect(findMany.mock.calls[0][0].where?.userId).toBe(USER);
  });
});

// The one documented exception, pinned so the Settings danger-zone copy stays
// true: clear-samples HARD-deletes, and a hard delete does renumber everything
// created after it. If this ever stopped being the case the warning would be
// describing something the app no longer does.
describe("the hard-delete exception", () => {
  it("renumbers everything created after a hard-deleted record", async () => {
    stubTable([row("sample", 0), row("kept", 10), row("also_kept", 20)]);
    const before = await accessionMap(USER);
    expect(before.get("kept")).toBe("A-0002");

    stubTable([row("kept", 10), row("also_kept", 20)]);
    const after = await accessionMap(USER);
    expect(after.get("kept")).toBe("A-0001");
    expect(after.get("also_kept")).toBe("A-0002");
  });
});

describe("the accession number's printed form", () => {
  it("pads to four digits so the column stays a column", () => {
    expect(formatAccession(1)).toBe("A-0001");
    expect(formatAccession(42)).toBe("A-0042");
    expect(formatAccession(217)).toBe("A-0217"); // the spec's own example
    expect(formatAccession(9999)).toBe("A-9999");
  });

  // Truncating at four digits would hand record 10000 the number already worn
  // by record 1 — two records, one identity. Growing the field is the only
  // safe direction, even though it costs the alignment.
  it("grows past four digits rather than wrapping onto a used number", () => {
    expect(formatAccession(10000)).toBe("A-10000");
    expect(formatAccession(10000)).not.toBe(formatAccession(1));
  });

  it("reads back as the ordinal it was printed from", () => {
    for (const n of [1, 9, 10, 99, 100, 1234, 9999, 10000]) {
      expect(Number(formatAccession(n).slice(2)), String(n)).toBe(n);
    }
  });
});

describe("the docket number's printed form", () => {
  // A2: two numbers, two jobs. The accession number takes a 1-based ordinal;
  // the docket number takes a 0-based array index and prints it 1-based. Pass
  // one where the other is expected and the labels are off by one with nothing
  // to reveal it — both still look like perfectly good numbers.
  it("turns a zero-based index into a one-based label", () => {
    expect(formatQueueNo(0)).toBe("Q-01");
    expect(formatQueueNo(3)).toBe("Q-04"); // the atelier mock's record
    expect(formatQueueNo(9)).toBe("Q-10");
    expect(formatQueueNo(99)).toBe("Q-100");
  });

  it("does not share a numbering convention with the accession number", () => {
    expect(formatQueueNo(1)).toBe("Q-02");
    expect(formatAccession(1)).toBe("A-0001");
  });

  it("wears a prefix that can never be read as an accession number", () => {
    for (const n of [0, 1, 25, 300]) {
      expect(formatQueueNo(n).startsWith("Q-")).toBe(true);
      expect(formatAccession(n).startsWith("A-")).toBe(true);
    }
  });
});

// `@/server/accession` re-exports the pure formatters so server callers can
// take everything from one place, while client components import them from
// `@/lib/notation` — which must not drag Prisma into a "use client" bundle.
// Two copies of a numbering rule is the failure this arrangement avoids.
describe("the two import paths for the formatters", () => {
  it("hand back the same function, not a second implementation", async () => {
    const notation = await import("@/lib/notation");
    expect(formatAccession).toBe(notation.formatAccession);
    expect(formatQueueNo).toBe(notation.formatQueueNo);
  });
});
