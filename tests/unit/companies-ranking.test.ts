import { describe, expect, it } from "vitest";
import { compareCompanies, type RankedCompany } from "@/app/companies/ranking";

const co = (over: Partial<RankedCompany> & { name: string }): RankedCompany => ({
  isSample: false,
  priorityScore: null,
  bestScore: null,
  ...over,
});

const order = (rows: RankedCompany[]) => [...rows].sort(compareCompanies).map((r) => r.name);

describe("the /companies register order", () => {
  /* The four fixtures the review found in the top twenty, with the real
     companies they were outranking. Seed priorities, no listings, no apps. */
  const SEEDED = [
    co({ name: "Anthropic", isSample: true, priorityScore: 95 }),
    co({ name: "Waymo", isSample: true, priorityScore: 90 }),
    co({ name: "Figma", isSample: true, priorityScore: 88 }),
    co({ name: "Perplexity", isSample: true, priorityScore: 88 }),
  ];
  const REAL = [
    co({ name: "Microsoft", priorityScore: 96, bestScore: 72 }),
    co({ name: "Scale AI", priorityScore: 87, bestScore: 73 }),
    co({ name: "CNO Financial Group", priorityScore: 40, bestScore: 62 }),
    co({ name: "Unrated Ltd" }),
  ];

  it("puts every real company above every sample, whatever the priority", () => {
    const names = order([...SEEDED, ...REAL]);
    const firstSample = names.findIndex((n) => SEEDED.some((s) => s.name === n));
    const lastReal = names.reduce((last, n, i) => (REAL.some((r) => r.name === n) ? i : last), -1);
    expect(names).toEqual([
      "Microsoft",
      "Scale AI",
      "CNO Financial Group",
      "Unrated Ltd",
      "Anthropic",
      "Waymo",
      "Figma",
      "Perplexity",
    ]);
    expect(firstSample).toBeGreaterThan(lastReal);
  });

  it("sinks a sample even below a company with no priority at all", () => {
    expect(
      order([co({ name: "Fixture", isSample: true, priorityScore: 100 }), co({ name: "Nobody" })])
    ).toEqual(["Nobody", "Fixture"]);
  });

  it("still ranks by priority desc, nulls last, within each half", () => {
    expect(
      order([
        co({ name: "None" }),
        co({ name: "Low", priorityScore: 10 }),
        co({ name: "High", priorityScore: 90 }),
      ])
    ).toEqual(["High", "Low", "None"]);
  });

  it("breaks a priority tie on best active score, then on name", () => {
    expect(
      order([
        co({ name: "Beta", priorityScore: 50, bestScore: 60 }),
        co({ name: "Alpha", priorityScore: 50, bestScore: 60 }),
        co({ name: "Gamma", priorityScore: 50, bestScore: 80 }),
      ])
    ).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  /* Sorting is only a total order if the comparator is consistent; an
     inconsistent one makes the page's order depend on the input permutation,
     which is exactly the class of bug a "why did this row move?" report is. */
  it("is antisymmetric and gives one order from any starting permutation", () => {
    const rows = [...SEEDED, ...REAL];
    // `|| 0` folds the -0 that `-Math.sign(0)` produces; Object.is separates it.
    const sign = (n: number) => Math.sign(n) || 0;
    for (const a of rows) {
      for (const b of rows) {
        expect(sign(compareCompanies(a, b)), `${a.name} vs ${b.name}`).toBe(
          sign(-compareCompanies(b, a))
        );
      }
    }
    const reference = order(rows);
    expect(order([...rows].reverse())).toEqual(reference);
    expect(order([rows[5], rows[0], rows[7], rows[2], rows[4], rows[1], rows[6], rows[3]])).toEqual(
      reference
    );
  });
});
