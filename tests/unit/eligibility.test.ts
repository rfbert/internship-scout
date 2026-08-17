import { describe, expect, it } from "vitest";
import { evaluateEligibility, makeGradWindows } from "@/server/eligibility";
import type { NormalizedPosting } from "@/lib/types";

type Loc = NormalizedPosting["locations"][number];

const SF: Loc = {
  rawText: "San Francisco, CA",
  city: "San Francisco",
  state: "CA",
  country: "US",
  isRemote: false,
};

function post(overrides: Partial<NormalizedPosting> = {}): NormalizedPosting {
  return {
    title: "Product Management Intern - Summer 2027",
    normalizedTitle: "product management",
    companyName: "Acme AI",
    normalizedCompany: "acme ai",
    locations: [SF],
    workArrangement: "ONSITE",
    description: "Join our team. Currently pursuing a Bachelor's degree.",
    postingUrl: "https://example.com/jobs/1",
    normalizedPostingUrl: "https://example.com/jobs/1",
    compensation: {
      payType: "HOURLY",
      minAmount: 45,
      maxAmount: 55,
      period: "hour",
      rawText: "$45-55/hr",
    },
    markers: {},
    ...overrides,
  };
}

const run = (p: NormalizedPosting, sourceImpliesSeason = false) =>
  evaluateEligibility(p, { sourceImpliesSeason });

describe("evaluateEligibility", () => {
  it("accepts a fully-qualified posting with every field populated", () => {
    const r = run(post());
    expect(r.eligible).toBe(true);
    expect(r.rejectReason).toBeUndefined();
    expect(r.seasonMatch).toBe("EXPLICIT");
    expect(r.seasonEvidence).toMatch(/summer\s*2027/i);
    expect(r.ugEligibility).toBe("UNDERGRAD_EXPLICIT");
    expect(r.isUS).toBe(true);
    expect(r.isPaid).toBe(true);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  describe("gate 1: internship keyword", () => {
    it("rejects titles without an internship keyword", () => {
      const r = run(post({ title: "Software Engineer - Summer 2027" }));
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe("NOT_AN_INTERNSHIP");
    });

    it("does not treat 'Internal' as 'Intern' (word boundary)", () => {
      const r = run(post({ title: "Internal Tools Engineer - Summer 2027" }));
      expect(r.rejectReason).toBe("NOT_AN_INTERNSHIP");
    });

    it("accepts co-op and coop titles case-insensitively", () => {
      for (const title of [
        "Product Co-Op - Summer 2027",
        "Engineering Coop (Summer 2027)",
        "SUMMER 2027 INTERNSHIP",
      ]) {
        const r = run(post({ title }));
        expect(r.rejectReason, title).not.toBe("NOT_AN_INTERNSHIP");
        expect(r.eligible, title).toBe(true);
      }
    });
  });

  describe("gate 2: closed marker", () => {
    it("rejects postings marked closed by the source", () => {
      const r = run(post({ markers: { closed: true } }));
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe("CLOSED");
    });

    it("still reports season/level/US/pay fields on a closed posting", () => {
      const r = run(post({ markers: { closed: true } }));
      expect(r.seasonMatch).toBe("EXPLICIT");
      expect(r.ugEligibility).toBe("UNDERGRAD_EXPLICIT");
      expect(r.isUS).toBe(true);
      expect(r.isPaid).toBe(true);
    });
  });

  describe("gate 3: season", () => {
    it("rejects 'Fall 2026' even when the source is a Summer-2027 list", () => {
      const r = run(post({ title: "Software Intern - Fall 2026" }), true);
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe("WRONG_SEASON");
      expect(r.seasonMatch).toBe("NEGATIVE");
      expect(r.seasonEvidence).toMatch(/fall\s*2026/i);
    });

    it("negative beats positive when both seasons appear", () => {
      const r = run(post({ title: "Intern - Summer 2026 & Summer 2027" }));
      expect(r.rejectReason).toBe("WRONG_SEASON");
      expect(r.seasonMatch).toBe("NEGATIVE");
      expect(r.seasonEvidence).toMatch(/summer\s*2026/i);
    });

    it("rejects new-grad language in the description", () => {
      const r = run(
        post({
          title: "Product Intern",
          description: "This is a new grad program for Bachelor's holders.",
        }),
      );
      expect(r.rejectReason).toBe("WRONG_SEASON");
      expect(r.seasonEvidence).toMatch(/new\s*grad/i);
    });

    it("rejects '2026 Start' and 'Winter 2027' cycles", () => {
      const a = run(post({ title: "PM Intern", description: "January 2026 start. Undergraduate students welcome." }));
      expect(a.rejectReason).toBe("WRONG_SEASON");
      const b = run(post({ title: "Winter 2027 Product Intern" }));
      expect(b.rejectReason).toBe("WRONG_SEASON");
    });

    it("infers the season from a dedicated source list when text is silent", () => {
      const r = run(post({ title: "Product Management Intern", description: "Pursuing a Bachelor's degree." }), true);
      expect(r.eligible).toBe(true);
      expect(r.seasonMatch).toBe("INFERRED");
      expect(r.seasonEvidence).toBeTruthy();
    });

    it("keeps unknown-season postings eligible with a note", () => {
      const r = run(post({ title: "Product Management Intern", description: "Pursuing a Bachelor's degree." }), false);
      expect(r.eligible).toBe(true);
      expect(r.seasonMatch).toBe("UNKNOWN");
      expect(r.seasonEvidence).toBeUndefined();
      expect(r.notes.some((n) => /season/i.test(n))).toBe(true);
    });

    it("detects 'Class of 2028' as an explicit positive signal", () => {
      const r = run(post({ title: "APM Intern", description: "Open to Class of 2028 undergraduates." }));
      expect(r.eligible).toBe(true);
      expect(r.seasonMatch).toBe("EXPLICIT");
      expect(r.seasonEvidence).toMatch(/class\s+of\s+2028/i);
    });
  });

  describe("gate 4: undergraduate eligibility", () => {
    it("rejects a PhD title as PHD_ONLY", () => {
      const r = run(
        post({
          title: "Research Intern, PhD - Summer 2027",
          description: "Work on frontier models.",
        }),
      );
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe("NOT_UNDERGRAD");
      expect(r.ugEligibility).toBe("PHD_ONLY");
    });

    it("rejects a description-level PhD requirement", () => {
      const r = run(
        post({
          title: "ML Intern - Summer 2027",
          description: "Applicants must be enrolled in a PhD program in CS or related field.",
        }),
      );
      expect(r.rejectReason).toBe("NOT_UNDERGRAD");
      expect(r.ugEligibility).toBe("PHD_ONLY");
    });

    it("does not treat an incidental PhD mention as a requirement", () => {
      const r = run(
        post({
          title: "ML Intern - Summer 2027",
          description: "You will collaborate with PhD scientists on the research team.",
        }),
      );
      expect(r.eligible).toBe(true);
      expect(r.ugEligibility).toBe("AMBIGUOUS");
    });

    it("classifies MS/PhD-only postings as GRAD_ONLY and rejects", () => {
      const r = run(
        post({
          title: "Applied AI Intern - Summer 2027",
          description: "Open to MS/PhD students only.",
        }),
      );
      expect(r.rejectReason).toBe("NOT_UNDERGRAD");
      expect(r.ugEligibility).toBe("GRAD_ONLY");
    });

    it("classifies graduate-student-only postings as GRAD_ONLY", () => {
      const r = run(
        post({
          title: "Data Intern - Summer 2027",
          description: "Must be a currently enrolled graduate student.",
        }),
      );
      expect(r.rejectReason).toBe("NOT_UNDERGRAD");
      expect(r.ugEligibility).toBe("GRAD_ONLY");
    });

    it("keeps BS/MS postings — undergrad mention wins over grad mention", () => {
      const r = run(
        post({
          title: "AI PM Intern - Summer 2027",
          description: "Pursuing a BS/MS in Computer Science or related.",
        }),
      );
      expect(r.eligible).toBe(true);
      expect(r.ugEligibility).toBe("UNDERGRAD_EXPLICIT");
    });

    it("treats rising senior/junior as undergrad-explicit", () => {
      const r = run(
        post({
          title: "Product Intern - Summer 2027",
          description: "Open to rising seniors and rising juniors.",
        }),
      );
      expect(r.eligible).toBe(true);
      expect(r.ugEligibility).toBe("UNDERGRAD_EXPLICIT");
    });

    it("does not misread 'undergraduate students' as 'graduate students'", () => {
      const r = run(
        post({
          title: "PM Intern - Summer 2027",
          description: "Open to undergraduate students in any major.",
        }),
      );
      expect(r.eligible).toBe(true);
      expect(r.ugEligibility).toBe("UNDERGRAD_EXPLICIT");
    });

    it("rejects graduation-before-start requirements even for undergrads", () => {
      const r = run(
        post({
          title: "PM Intern - Summer 2027",
          description: "Bachelor's degree required. Candidates must graduate by December 2026.",
        }),
      );
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe("NOT_UNDERGRAD");
      expect(r.ugEligibility).toBe("UNDERGRAD_EXPLICIT");
      expect(r.notes.some((n) => /graduation-window/i.test(n))).toBe(true);
    });

    it("rejects 'graduation before the internship' phrasing but not 'must not graduate before'", () => {
      const bad = run(
        post({
          title: "PM Intern - Summer 2027",
          description: "Requires graduation before the internship begins.",
        }),
      );
      expect(bad.rejectReason).toBe("NOT_UNDERGRAD");

      const good = run(
        post({
          title: "PM Intern - Summer 2027",
          description: "Undergraduates who must not graduate before the internship ends are eligible.",
        }),
      );
      expect(good.eligible).toBe(true);
    });

    it("marks postings with no level signal as AMBIGUOUS and keeps them", () => {
      const r = run(post({ description: "Build products with us. Summer 2027." }));
      expect(r.eligible).toBe(true);
      expect(r.ugEligibility).toBe("AMBIGUOUS");
    });
  });

  describe("gate 5: US geography", () => {
    it("rejects London-only postings", () => {
      const r = run(
        post({
          locations: [
            { rawText: "London, United Kingdom", city: "London", country: "United Kingdom", isRemote: false },
          ],
        }),
      );
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe("NOT_US");
      expect(r.isUS).toBe(false);
    });

    it("rejects Berlin+London (multiple non-US) postings", () => {
      const r = run(
        post({
          locations: [
            { rawText: "Berlin, Germany", city: "Berlin", country: "Germany", isRemote: false },
            { rawText: "London, UK", city: "London", country: "GB", isRemote: false },
          ],
        }),
      );
      expect(r.rejectReason).toBe("NOT_US");
    });

    it("rejects Canada known only via the country field", () => {
      const r = run(
        post({
          locations: [{ rawText: "Toronto, ON", city: "Toronto", state: "ON", country: "Canada", isRemote: false }],
        }),
      );
      expect(r.rejectReason).toBe("NOT_US");
    });

    it("keeps mixed US + international postings", () => {
      const r = run(
        post({
          locations: [
            SF,
            { rawText: "London, United Kingdom", city: "London", country: "United Kingdom", isRemote: false },
          ],
        }),
      );
      expect(r.eligible).toBe(true);
      expect(r.isUS).toBe(true);
      expect(r.notes.some((n) => /international/i.test(n))).toBe(true);
    });

    it("accepts explicit US remote", () => {
      const r = run(
        post({
          workArrangement: "REMOTE",
          locations: [{ rawText: "Remote - USA", country: "US", isRemote: true }],
        }),
      );
      expect(r.eligible).toBe(true);
      expect(r.isUS).toBe(true);
    });

    it("recognizes city+state raw text without a country field value", () => {
      const r = run(
        post({ locations: [{ rawText: "New York, NY 10001", country: "", isRemote: false }] }),
      );
      expect(r.isUS).toBe(true);
    });

    it("does not read 'Perth, WA, Australia' as Washington state", () => {
      const r = run(
        post({ locations: [{ rawText: "Perth, WA, Australia", country: "Australia", isRemote: false }] }),
      );
      expect(r.rejectReason).toBe("NOT_US");
    });

    it("does not read 'Albuquerque, New Mexico' as Mexico", () => {
      const r = run(
        post({ locations: [{ rawText: "Albuquerque, New Mexico", country: "", isRemote: false }] }),
      );
      expect(r.eligible).toBe(true);
      expect(r.rejectReason).toBeUndefined();
    });

    it("keeps postings with no locations, with a note", () => {
      const r = run(post({ locations: [] }));
      expect(r.eligible).toBe(true);
      expect(r.isUS).toBe(false);
      expect(r.notes.some((n) => /location/i.test(n))).toBe(true);
    });

    it("keeps non-US + unresolved location mixes for manual review", () => {
      const r = run(
        post({
          locations: [
            { rawText: "London, United Kingdom", city: "London", country: "United Kingdom", isRemote: false },
            { rawText: "Flexible", country: "", isRemote: false },
          ],
        }),
      );
      expect(r.eligible).toBe(true);
      expect(r.isUS).toBe(false);
    });
  });

  describe("gate 6: paid", () => {
    it("rejects unpaid roles", () => {
      const r = run(post({ compensation: { payType: "UNPAID", rawText: "Unpaid" } }));
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe("UNPAID");
      expect(r.isPaid).toBe(false);
    });

    it("keeps unknown-compensation roles with isPaid UNKNOWN and a note", () => {
      const r = run(post({ compensation: { payType: "UNKNOWN" } }));
      expect(r.eligible).toBe(true);
      expect(r.isPaid).toBe("UNKNOWN");
      expect(r.notes.some((n) => /compensation/i.test(n))).toBe(true);
    });

    it("treats stipend and monthly pay as paid", () => {
      for (const payType of ["STIPEND", "MONTHLY"] as const) {
        const r = run(post({ compensation: { payType, rawText: "$8k/mo" } }));
        expect(r.isPaid, payType).toBe(true);
        expect(r.eligible, payType).toBe(true);
      }
    });
  });

  describe("gate ordering", () => {
    it("reports the first failing gate when several fail", () => {
      const r = run(
        post({
          title: "Fall 2026 Analyst", // not an internship + wrong season
          markers: { closed: true }, // closed
          compensation: { payType: "UNPAID" }, // unpaid
        }),
      );
      expect(r.rejectReason).toBe("NOT_AN_INTERNSHIP");
      expect(r.seasonMatch).toBe("NEGATIVE");
      expect(r.isPaid).toBe(false);
    });

    it("closed beats wrong season, which beats unpaid", () => {
      const r = run(
        post({
          title: "Summer 2026 Intern",
          markers: { closed: true },
          compensation: { payType: "UNPAID" },
        }),
      );
      expect(r.rejectReason).toBe("CLOSED");
    });
  });
});

// Regression: validation found Palantir "…Internship - Poland" / "- France"
// stored with a stale "New York, NY" location, so they scored as US roles for
// an F-1 student who needs to work in the US. A country named in the TITLE is
// authoritative about where the role sits.
describe("gate 5: foreign country in the title overrides a US location", () => {
  const foreignTitles = [
    "Forward Deployed Software Engineer, Internship - Poland",
    "Forward Deployed Software Engineer, Internship - France",
    "Software Engineer Intern - London",
    "Machine Learning Intern - Singapore",
    "Software Engineer Intern, Bengaluru",
  ];
  for (const title of foreignTitles) {
    it(`"${title}" → NOT_US even with a US location row`, () => {
      const r = run(post({ title: `${title} - Summer 2027` }));
      expect(r.isUS).toBe(false);
      expect(r.rejectReason).toBe("NOT_US");
    });
  }

  it("does not fire on US titles that merely contain a state/city name", () => {
    const r = run(post({ title: "Software Engineer Intern - New York - Summer 2027" }));
    expect(r.isUS).toBe(true);
    expect(r.rejectReason).toBeUndefined();
  });

  it("does not fire on 'India' inside an unrelated word (Indiana / Indianapolis)", () => {
    const r = run(post({ title: "Software Engineer Intern - Indianapolis, Indiana - Summer 2027" }));
    expect(r.isUS).toBe(true);
    expect(r.rejectReason).toBeUndefined();
  });
});

describe("season — reversed word order", () => {
  it("rejects '2026 Fall' and '2026 Summer' titles", async () => {
    const { SEASON_NEGATIVE_PATTERNS } = await import("@/lib/constants");
    expect(SEASON_NEGATIVE_PATTERNS.some((rx: RegExp) => rx.test("Machine Learning Engineer Intern - App Ads - 2026 Fall - BS/MS"))).toBe(true);
    expect(SEASON_NEGATIVE_PATTERNS.some((rx: RegExp) => rx.test("MLE Intern - 2026 Summer - BS/MS"))).toBe(true);
    expect(SEASON_NEGATIVE_PATTERNS.some((rx: RegExp) => rx.test("AI PM Intern Summer 2027"))).toBe(false);
  });
});

// Regression: post-fix validation found wrong-season roles still ranked at the
// top because these phrasings slipped past the negative patterns.
describe("season — punctuation and date-range phrasings", () => {
  const neg = async (s: string) => {
    const { SEASON_NEGATIVE_PATTERNS } = await import("@/lib/constants");
    return SEASON_NEGATIVE_PATTERNS.some((rx: RegExp) => rx.test(s));
  };

  it("'(Fall, 2026)' — comma between season and year", async () => {
    expect(await neg("Machine Learning Intern/Co-op  (Fall, 2026)")).toBe(true);
  });

  it("'Fall 2026' variants with punctuation", async () => {
    expect(await neg("Intern - Fall,2026")).toBe(true);
    expect(await neg("Summer, 2026 Internship")).toBe(true);
  });

  it("a term that runs September–December 2026 is a Fall 2026 co-op", async () => {
    expect(
      await neg("The co-op runs September 7 through December 18, 2026, Monday to Friday."),
    ).toBe(true);
  });

  it("a 12-month / year-long program is not a Summer 2027 internship", async () => {
    expect(await neg("Year at Palantir - Forward Deployed Software Engineer")).toBe(true);
    expect(await neg("This is a 12-month full-time program.")).toBe(true);
  });

  it("does not fire on genuine Summer 2027 postings", async () => {
    expect(await neg("AI PM Intern Summer 2027")).toBe(false);
    expect(await neg("Software Engineer Intern - Summer 2027, starting June 2027")).toBe(false);
  });
});

// Regression: Lila Sciences ("Master's or PhD") and XPENG ("Master's or PhD
// required") ranked in the top 15 despite being closed to a BS undergrad.
describe("gate 4: an explicit Master's/PhD requirement rejects even when 'Bachelor' appears", () => {
  it("'Master's or PhD required' → GRAD_ONLY", () => {
    const r = run(
      post({
        description:
          "Basic Qualifications: Currently pursuing a Master's or PhD in Computer Science. Bachelor's degree holders will not be considered.",
      }),
    );
    expect(r.rejectReason).toBe("NOT_UNDERGRAD");
  });

  it("'must be enrolled in a Master's or PhD program' → rejected", () => {
    const r = run(
      post({ description: "You must be enrolled in a Master's or PhD program in a technical field." }),
    );
    expect(r.rejectReason).toBe("NOT_UNDERGRAD");
  });

  it("still accepts BS/MS postings open to undergrads", () => {
    const r = run(
      post({ description: "Currently pursuing a BS/MS in Computer Science. Undergraduates welcome." }),
    );
    expect(r.rejectReason).toBeUndefined();
  });

  // Guard against over-rejection: comma-separated degree lists include the BS.
  it("'BS, MS, or PhD' is undergrad-inclusive — must NOT be rejected", () => {
    const r = run(
      post({ description: "Qualifications: BS, MS, or PhD in Computer Science, Electrical Engineering, or Robotics." }),
    );
    expect(r.rejectReason).toBeUndefined();
  });

  it("'Bachelor's, Master's, or PhD' is undergrad-inclusive", () => {
    const r = run(
      post({ description: "Pursuing a Bachelor's, Master's, or PhD degree in a technical field." }),
    );
    expect(r.rejectReason).toBeUndefined();
  });
});

describe("season — bare Fall/Spring/Winter terms (no year)", () => {
  const neg = async (t: string) => {
    const { SEASON_NEGATIVE_PATTERNS } = await import("@/lib/constants");
    return SEASON_NEGATIVE_PATTERNS.some((rx: RegExp) => rx.test(t));
  };
  it("'AI Engineering Fall Co-Op' is not a Summer 2027 internship", async () => {
    expect(await neg("AI Engineering Fall Co-Op")).toBe(true);
  });
  it("'Fall Internship' / 'Spring Co-op' are wrong season", async () => {
    expect(await neg("Software Engineer Fall Internship")).toBe(true);
    expect(await neg("Data Spring Co-op")).toBe(true);
  });
  it("does not fire on Summer internships or the word 'fallback'", async () => {
    expect(await neg("Summer Internship 2027")).toBe(false);
    expect(await neg("Build fallback handling for the API")).toBe(false);
  });
});

// Regression: Palantir's USG internship requires "planning on graduating in
// 2027" as a final internship; this user graduates June 2028, so it is closed
// to them even though nothing about it looks wrong on the surface.
describe("gate 4: graduation-year windows that exclude a June 2028 grad", () => {
  it("'Must be planning on graduating in 2027' → rejected", () => {
    const r = run(
      post({
        description:
          "What We Require: Must be planning on graduating in 2027. This should be your final internship before starting full-time.",
      }),
    );
    expect(r.rejectReason).toBe("NOT_UNDERGRAD");
  });

  it("'graduating in 2026' → rejected", () => {
    const r = run(post({ description: "Candidates graduating in December 2026 are preferred." }));
    expect(r.rejectReason).toBe("NOT_UNDERGRAD");
  });

  it("a window that INCLUDES 2028 is accepted", () => {
    const r = run(
      post({ description: "Must be graduating between December 2027 and September 2028. Bachelor's students welcome." }),
    );
    expect(r.rejectReason).toBeUndefined();
  });

  it("'graduating in 2028' is accepted", () => {
    const r = run(post({ description: "Open to students graduating in 2028." }));
    expect(r.rejectReason).toBeUndefined();
  });
});

// Regression (live Databricks posting): "Product Management Intern (Summer
// 2027)" was rejected as WRONG_SEASON because its GRADUATION requirement says
// "graduating in Fall 2027 or Spring 2028". A graduation window is not the
// internship season — this hid the user's single best-matching role.
describe("season — a graduation window must not be read as the season", () => {
  it("Databricks: Summer 2027 title + 'graduating in Fall 2027 or Spring 2028' stays eligible", () => {
    const r = run(
      post({
        title: "Product Management Intern (Summer 2027)",
        description:
          "Pursuing a bachelor's or master's in computer science or a related engineering field graduating in Fall 2027 or Spring 2028.",
      }),
    );
    expect(r.rejectReason).toBeUndefined();
    expect(r.seasonMatch).toBe("EXPLICIT");
  });

  it("still rejects a real Fall 2027 internship term", () => {
    const r = run(post({ title: "Software Engineer Intern - Fall 2027" }));
    expect(r.rejectReason).toBe("WRONG_SEASON");
  });

  it("still rejects 'graduating' text when the term itself is Fall 2026", () => {
    const r = run(post({ title: "Intern - Fall 2026", description: "Graduating in 2028." }));
    expect(r.rejectReason).toBe("WRONG_SEASON");
  });
});

describe("US cities that share a name with a foreign city", () => {
  const loc = (rawText: string, state?: string): Loc => ({
    rawText,
    state,
    country: "",
    isRemote: false,
  });

  it("keeps 'Vancouver, WA' (US state code wins over the foreign-city list)", () => {
    const r = run(post({ locations: [loc("Vancouver, WA", "WA")] }));
    expect(r.isUS).toBe(true);
    expect(r.rejectReason).not.toBe("NOT_US");
  });

  it("keeps 'Dublin, CA'", () => {
    const r = run(post({ locations: [loc("Dublin, CA", "CA")] }));
    expect(r.isUS).toBe(true);
    expect(r.rejectReason).not.toBe("NOT_US");
  });

  it("keeps 'Melbourne, FL'", () => {
    const r = run(post({ locations: [loc("Melbourne, FL", "FL")] }));
    expect(r.isUS).toBe(true);
    expect(r.rejectReason).not.toBe("NOT_US");
  });

  it("still rejects 'Perth, WA, Australia' (named country beats the state code)", () => {
    const r = run(post({ locations: [loc("Perth, WA, Australia", "WA")] }));
    expect(r.rejectReason).toBe("NOT_US");
  });

  it("still rejects a bare foreign city 'Bengaluru'", () => {
    const r = run(post({ locations: [loc("Bengaluru")] }));
    expect(r.rejectReason).toBe("NOT_US");
  });

  it("keeps a title naming a US-stated city: 'Software Engineer Intern - Dublin, CA'", () => {
    const r = run(post({ title: "Software Engineer Intern - Dublin, CA (Summer 2027)" }));
    expect(r.rejectReason).not.toBe("NOT_US");
  });

  it("still rejects a title naming a bare foreign city: 'Intern - London'", () => {
    const r = run(post({ title: "Software Engineer Intern - London (Summer 2027)" }));
    expect(r.rejectReason).toBe("NOT_US");
  });
});

// ── Phase 2: parameterized gates (prefs drive the windows) ───────────────────

describe("parameterized graduation window (prefs.graduationDate)", () => {
  const gradJune = (year: number) => new Date(Date.UTC(year, 5, 15));

  it("default (no prefs) keeps the June-2028 behavior and note wording", () => {
    const r = run(post({ description: "Must be planning on graduating in 2027." }));
    expect(r.rejectReason).toBe("NOT_UNDERGRAD");
    expect(r.notes.some((n) => n.includes("June 2028"))).toBe(true);
  });

  it("a June 2027 graduate keeps 'graduating in 2027' postings", () => {
    const r = evaluateEligibility(post({ description: "Must be planning on graduating in 2027." }), {
      sourceImpliesSeason: false,
      prefs: { graduationDate: gradJune(2027) },
    });
    expect(r.rejectReason).toBeUndefined();
  });

  it("a June 2027 graduate still rejects 'graduating in 2026', naming their date", () => {
    const r = evaluateEligibility(post({ description: "Candidates graduating in December 2026 are preferred." }), {
      sourceImpliesSeason: false,
      prefs: { graduationDate: gradJune(2027) },
    });
    expect(r.rejectReason).toBe("NOT_UNDERGRAD");
    expect(r.notes.some((n) => n.includes("June 2027"))).toBe(true);
  });

  it("a June 2029 graduate rejects 'graduating in 2028'", () => {
    const r = evaluateEligibility(post({ description: "Open to students graduating in 2028." }), {
      sourceImpliesSeason: false,
      prefs: { graduationDate: gradJune(2029) },
    });
    expect(r.rejectReason).toBe("NOT_UNDERGRAD");
  });

  it("a June 2029 graduate keeps 'graduating in 2029'", () => {
    const r = evaluateEligibility(post({ description: "Open to students graduating in 2029." }), {
      sourceImpliesSeason: false,
      prefs: { graduationDate: gradJune(2029) },
    });
    expect(r.rejectReason).toBeUndefined();
  });
});

describe("parameterized target season (prefs.targetSeason)", () => {
  const prefs = { targetSeason: "SUMMER_2028" };
  const runWith = (p: NormalizedPosting) =>
    evaluateEligibility(p, { sourceImpliesSeason: false, prefs });

  it("'Summer 2028' becomes the explicit positive signal", () => {
    const r = runWith(post({ title: "Product Management Intern - Summer 2028" }));
    expect(r.eligible).toBe(true);
    expect(r.seasonMatch).toBe("EXPLICIT");
    expect(r.notes.some((n) => n.includes("SUMMER_2028"))).toBe(true);
  });

  it("'Summer 2027' is now the prior cycle — rejected", () => {
    const r = runWith(post()); // default title says Summer 2027
    expect(r.rejectReason).toBe("WRONG_SEASON");
    expect(r.seasonMatch).toBe("NEGATIVE");
  });

  it("'Fall 2028' is the wrong term for a Summer 2028 target", () => {
    const r = runWith(post({ title: "Software Engineer Intern - Fall 2028" }));
    expect(r.rejectReason).toBe("WRONG_SEASON");
  });

  it("'Class of 2029' reads as rising seniors for Summer 2028", () => {
    const r = runWith(post({ title: "APM Intern", description: "Open to Class of 2029 undergraduates." }));
    expect(r.seasonMatch).toBe("EXPLICIT");
  });

  it("an unknown season string falls back to the SUMMER_2027 default", () => {
    const r = evaluateEligibility(post(), { sourceImpliesSeason: false, prefs: { targetSeason: "bogus" } });
    expect(r.eligible).toBe(true);
    expect(r.seasonMatch).toBe("EXPLICIT");
  });
});

// The generated default patterns must be byte-identical to the legacy
// hand-written lists — this is the contract that makes makeSeasonPatterns a
// safe replacement for the old constants.
describe("makeSeasonPatterns — SUMMER_2027 output is pinned to the legacy sources", () => {
  it("positive patterns", async () => {
    const { SEASON_POSITIVE_PATTERNS } = await import("@/lib/constants");
    expect(SEASON_POSITIVE_PATTERNS.map((r) => r.source)).toEqual([
      "summer\\s*20?27",
      "20?27\\s*summer",
      "2027\\s*(university\\s*)?intern",
      "intern(ship)?\\s*(-|—|–)?\\s*2027",
      "undergraduate\\s+intern(ship)?\\s+2027",
      "early\\s+careers?\\s+2027",
      "university\\s+recruiting\\s+2027",
      "class\\s+of\\s+2028",
    ]);
  });

  it("negative patterns", async () => {
    const { SEASON_NEGATIVE_PATTERNS } = await import("@/lib/constants");
    expect(SEASON_NEGATIVE_PATTERNS.map((r) => r.source)).toEqual([
      "summer[,\\s]*20?26",
      "fall[,\\s]*20?26",
      "winter[,\\s]*20?2[67]",
      "spring[,\\s]*20?2[67]",
      "fall[,\\s]*20?27",
      "\\b20?26[,\\s]*(fall|summer|winter|spring)\\b",
      "\\b2027[,\\s]*(fall|winter)\\b",
      "20?26\\s*start",
      "new\\s*grad",
      "\\b(?:aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?)\\b[^.\\n]{0,60}\\b(?:through|to|[-–—])\\b[^.\\n]{0,60}\\b(?:dec(?:ember)?|nov(?:ember)?|jan(?:uary)?)\\b[^.\\n]{0,20}\\b20?26\\b",
      "\\b(?:fall|autumn|spring|winter)\\s+(?:co[\\s-]?op|internship|intern\\b)",
      "\\b(?:co[\\s-]?op|internship|intern)\\s+(?:-\\s*)?(?:fall|autumn|spring|winter)\\b",
      "\\byear\\s+at\\s+[a-z]",
      "\\b12[\\s-]month\\b",
      "\\b(?:one|1)[\\s-]year\\s+(?:full[\\s-]time\\s+)?program\\b",
    ]);
    expect(SEASON_NEGATIVE_PATTERNS.every((r) => r.flags === "i")).toBe(true);
  });
});

// Same contract for the grad-window regexes: the generated defaults (grad
// June 2028, season year 2027) must be byte-identical to the legacy
// hand-written GRAD_YEAR_* / GRAD_WINDOW_RX literals they replaced.
describe("makeGradWindows — default output is pinned to the legacy sources", () => {
  const defaults = makeGradWindows(null, 2027);

  it("graduation-year requirement", () => {
    expect(defaults.requirementRx.source).toBe(
      "\\bgraduat(?:e|ing|ion)\\b[^.\\n]{0,40}\\b20(?:2[4-7])\\b",
    );
    expect(defaults.requirementRx.flags).toBe("i");
  });

  it("accepted-year escape hatch", () => {
    expect(defaults.okRx.source).toBe(
      "\\bgraduat(?:e|ing|ion)\\b[^.\\n]{0,60}\\b20(?:2[89]|3\\d)\\b|\\b20(?:2[89])\\b[^.\\n]{0,30}\\bgraduat",
    );
    expect(defaults.okRx.flags).toBe("i");
  });

  it("graduation-window patterns", () => {
    expect(defaults.windowRx.map((r) => r.source)).toEqual([
      "must\\s+graduate\\s+by\\s+(?:[a-z]+\\s+)?20(?:1\\d|2[0-6])\\b",
      "(?<!not\\s)\\bgraduat(?:e|ing|ion)[^.\\n]{0,40}?\\b(?:before|prior\\s+to)\\s+(?:the\\s+)?(?:internship|program|start)",
      "(?<!not\\s)\\bgraduat(?:e|ing|ion)(?:\\s+date)?\\s+(?:on\\s+or\\s+)?before\\s+(?:[a-z]+\\s+)?20(?:1\\d|2[0-6])\\b",
    ]);
    expect(defaults.windowRx.every((r) => r.flags === "i")).toBe(true);
  });

  it("labels the default graduation as June 2028", () => {
    expect(defaults.gradLabel).toBe("June 2028");
  });

  // The compact two-digit form above is a formatting choice, not a semantic
  // one — a wider run still emits a range.
  it("emits a hyphenated range for runs longer than two digits", () => {
    expect(makeGradWindows(new Date(Date.UTC(2030, 5, 15)), 2027).requirementRx.source).toContain(
      "20(?:2[6-9])",
    );
  });
});
