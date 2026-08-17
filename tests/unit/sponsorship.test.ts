import { describe, expect, it } from "vitest";
import {
  assessSponsorshipRules,
  reconstructMarkersFromQuotes,
} from "@/server/sponsorship";

const F1_NOTE = /F-1 CPT internships do not require employer H-1B sponsorship/;
const H1B_NOTE = /likely refers to H-1B/;
const VERIFY = /verify with the recruiter/i;

describe("hard reject: citizenship / permanent residency", () => {
  it("rejects 'must be a U.S. citizen' with full result shape", () => {
    const r = assessSponsorshipRules({
      text: "Applicants must be a U.S. citizen to be considered.",
    });
    expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    expect(r.confidence).toBe("CONFIRMED");
    expect(r.hardReject).toBe(true);
    expect(r.cptCompatible).toBe(false);
    expect(r.optCompatible).toBe(false);
    expect(r.futureSponsorshipPotential).toBe("UNLIKELY");
    expect(r.conflictingInfo).toBeUndefined();
    expect(r.matchedText).toContain("Applicants must be a U.S. citizen to be considered.");
  });

  it("matches case-insensitively", () => {
    const r = assessSponsorshipRules({ text: "ALL CANDIDATES MUST BE A U.S. CITIZEN." });
    expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    expect(r.hardReject).toBe(true);
  });

  it("rejects 'US citizenship required'", () => {
    const r = assessSponsorshipRules({ text: "US citizenship required for this role." });
    expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    expect(r.confidence).toBe("CONFIRMED");
    expect(r.hardReject).toBe(true);
  });

  it("rejects 'citizens only'", () => {
    const r = assessSponsorshipRules({ text: "Open to U.S. citizens only." });
    expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    expect(r.hardReject).toBe(true);
  });

  it("treats permanent-resident-required phrasing as citizenship-class rejection", () => {
    const r = assessSponsorshipRules({
      text: "Candidates must be a lawful permanent resident of the United States.",
    });
    expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    expect(r.confidence).toBe("CONFIRMED");
    expect(r.hardReject).toBe(true);
    expect(r.futureSponsorshipPotential).toBe("UNLIKELY");
  });

  it("rejects 'green card holders only'", () => {
    const r = assessSponsorshipRules({ text: "Green card holders only." });
    expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    expect(r.hardReject).toBe(true);
  });
});

describe("hard reject: security clearance", () => {
  it("rejects 'active security clearance'", () => {
    const r = assessSponsorshipRules({
      text: "Requires an active security clearance at the TS level.",
    });
    expect(r.category).toBe("CLEARANCE_REQUIRED");
    expect(r.confidence).toBe("CONFIRMED");
    expect(r.hardReject).toBe(true);
    expect(r.cptCompatible).toBe(false);
  });

  it("rejects 'ability to obtain a security clearance'", () => {
    const r = assessSponsorshipRules({
      text: "Ability to obtain a security clearance is required for this position.",
    });
    expect(r.category).toBe("CLEARANCE_REQUIRED");
    expect(r.hardReject).toBe(true);
  });
});

describe("hard reject: sponsorship explicitly unavailable", () => {
  it.each([
    "We do not sponsor employment visas at this time.",
    "The company is unable to sponsor applicants.",
    "Employer will not sponsor applicants for work visas.",
    "We cannot sponsor visas for this role.",
    "Please note there is no visa sponsorship.",
    "Acme does not sponsor employment visas.",
    "Candidates must not require sponsorship now or in the future.",
    "Must be able to work without the need for sponsorship now or in the future.",
  ])("rejects %s", (text) => {
    const r = assessSponsorshipRules({ text });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.confidence).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
    expect(r.cptCompatible).toBe(false);
    expect(r.optCompatible).toBe(false);
    expect(r.futureSponsorshipPotential).toBe("UNLIKELY");
  });

  it("company history never upgrades an explicit refusal", () => {
    const r = assessSponsorshipRules({
      text: "We do not sponsor visas.",
      companyHasHistory: true,
    });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
    expect(r.futureSponsorshipPotential).toBe("UNLIKELY");
  });
});

describe("hard reject: unrestricted work authorization", () => {
  it("rejects 'permanent unrestricted work authorization'", () => {
    const r = assessSponsorshipRules({
      text: "This position requires permanent unrestricted work authorization in the United States.",
    });
    expect(r.category).toBe("UNRESTRICTED_AUTH_REQUIRED");
    expect(r.confidence).toBe("CONFIRMED");
    expect(r.hardReject).toBe(true);
  });

  it("rejects 'unrestricted authorization to work'", () => {
    const r = assessSponsorshipRules({
      text: "Candidates must have unrestricted authorization to work in the United States.",
    });
    expect(r.category).toBe("UNRESTRICTED_AUTH_REQUIRED");
    expect(r.hardReject).toBe(true);
  });
});

describe("aggregator markers", () => {
  // Regression (Akuna Capital): a community aggregator's 🇺🇸 emoji is NOT an
  // authoritative citizenship requirement. When it is the only signal (the
  // official posting was never fetched) it must flag for verification, never
  // auto-classify Ineligible. See docs — this was the dangerous false negative.
  it("🇺🇸 marker alone does NOT hard-reject — low-confidence flag, verify not Ineligible", () => {
    const r = assessSponsorshipRules({
      text: "Software Engineer Intern at Akuna Capital.",
      markers: { citizenshipRequired: true },
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.confidence).toBe("LOW");
    expect(r.hardReject).toBe(false);
    expect(r.cptCompatible).toBe(true);
    expect(r.matchedText.some((q) => q.includes("🇺🇸"))).toBe(true);
    expect(r.explanation).toMatch(/verify/i);
    expect(r.explanation).toMatch(/community|aggregat|source list|not.*confirmed/i);
  });

  it("🛂 marker is a flag, not a reject", () => {
    const r = assessSponsorshipRules({
      text: "Product Intern at a growing startup.",
      markers: { noSponsorship: true },
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.confidence).toBe("LOW");
    expect(r.hardReject).toBe(false);
    expect(r.cptCompatible).toBe(true);
    expect(r.explanation).toMatch(F1_NOTE);
    expect(r.explanation).toMatch(H1B_NOTE);
    expect(r.explanation).toMatch(VERIFY);
    expect(r.matchedText.some((q) => q.includes("🛂"))).toBe(true);
  });
});

describe("positive signals", () => {
  it("'visa sponsorship available' → SPONSORSHIP_OFFERED / HIGH", () => {
    const r = assessSponsorshipRules({
      text: "Visa sponsorship available for qualified candidates.",
    });
    expect(r.category).toBe("SPONSORSHIP_OFFERED");
    expect(r.confidence).toBe("HIGH");
    expect(r.hardReject).toBe(false);
    expect(r.cptCompatible).toBe(true);
    expect(r.optCompatible).toBe(true);
    expect(r.futureSponsorshipPotential).toBe("LIKELY");
  });

  it("'will sponsor' → SPONSORSHIP_OFFERED", () => {
    const r = assessSponsorshipRules({ text: "Acme will sponsor work visas for interns." });
    expect(r.category).toBe("SPONSORSHIP_OFFERED");
    expect(r.confidence).toBe("HIGH");
  });

  it("'H-1B sponsorship' → SPONSORSHIP_OFFERED", () => {
    const r = assessSponsorshipRules({
      text: "This position includes H-1B sponsorship for exceptional candidates.",
    });
    expect(r.category).toBe("SPONSORSHIP_OFFERED");
    expect(r.hardReject).toBe(false);
  });

  it("'CPT' mention → CPT_OPT_ACCEPTED / HIGH", () => {
    const r = assessSponsorshipRules({ text: "Students on CPT are welcome to apply." });
    expect(r.category).toBe("CPT_OPT_ACCEPTED");
    expect(r.confidence).toBe("HIGH");
    expect(r.futureSponsorshipPotential).toBe("LIKELY");
  });

  it("'F-1' mention → CPT_OPT_ACCEPTED", () => {
    const r = assessSponsorshipRules({
      text: "We accept F-1 students with university authorization.",
    });
    expect(r.category).toBe("CPT_OPT_ACCEPTED");
  });

  it("'international students are encouraged' → CPT_OPT_ACCEPTED", () => {
    const r = assessSponsorshipRules({
      text: "International students are encouraged to apply.",
    });
    expect(r.category).toBe("CPT_OPT_ACCEPTED");
  });

  it("lowercase 'opt' (opt in / Optional) never triggers the OPT acronym", () => {
    const r = assessSponsorshipRules({
      text: "Employees may opt in to commuter benefits. Optional equipment provided.",
    });
    expect(r.category).toBe("NO_INFO");
    expect(r.matchedText).toEqual([]);
  });

  it("'may be eligible for sponsorship' → FUTURE_POSSIBLE / MODERATE", () => {
    const r = assessSponsorshipRules({
      text: "Exceptional candidates may be eligible for sponsorship.",
    });
    expect(r.category).toBe("FUTURE_POSSIBLE");
    expect(r.confidence).toBe("MODERATE");
    expect(r.futureSponsorshipPotential).toBe("POSSIBLE");
  });

  it("'sponsorship considered' → FUTURE_POSSIBLE", () => {
    const r = assessSponsorshipRules({
      text: "Sponsorship considered on a case-by-case basis.",
    });
    expect(r.category).toBe("FUTURE_POSSIBLE");
    expect(r.confidence).toBe("MODERATE");
  });

  it("SPONSORSHIP_OFFERED outranks weaker positives when both match", () => {
    const r = assessSponsorshipRules({
      text: "Visa sponsorship available. CPT students welcome.",
    });
    expect(r.category).toBe("SPONSORSHIP_OFFERED");
    expect(r.matchedText.length).toBe(2);
  });
});

describe("flag-not-reject (CPT nuance)", () => {
  it("'sponsorship is not available for this role' → UNCERTAIN, kept for review", () => {
    const r = assessSponsorshipRules({
      text: "Sponsorship is not available for this role.",
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.confidence).toBe("LOW");
    expect(r.hardReject).toBe(false);
    expect(r.cptCompatible).toBe(true);
    expect(r.optCompatible).toBe(true);
    expect(r.futureSponsorshipPotential).toBe("UNKNOWN");
    expect(r.explanation).toMatch(F1_NOTE);
    expect(r.explanation).toMatch(H1B_NOTE);
    expect(r.explanation).toMatch(VERIFY);
    expect(r.matchedText).toContain("Sponsorship is not available for this role.");
  });

  it("'no sponsorship for this position' → UNCERTAIN flag", () => {
    const r = assessSponsorshipRules({ text: "There is no sponsorship for this position." });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.hardReject).toBe(false);
  });

  it("'no H-1B sponsorship' is flagged, not read as positive", () => {
    const r = assessSponsorshipRules({
      text: "We offer no H-1B sponsorship for this internship.",
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.hardReject).toBe(false);
    expect(r.conflictingInfo).toBeUndefined();
  });

  it("flag + company history → futureSponsorshipPotential LIKELY", () => {
    const r = assessSponsorshipRules({
      text: "Sponsorship is not available for this role.",
      companyHasHistory: true,
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.futureSponsorshipPotential).toBe("LIKELY");
  });

  it("'now or in the future' strengthener escalates the flag to a hard reject", () => {
    const r = assessSponsorshipRules({
      text: "Visa sponsorship is not available for this role now or in the future.",
    });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.confidence).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
    expect(r.futureSponsorshipPotential).toBe("UNLIKELY");
  });
});

describe("conflicting signals", () => {
  it("positive + hard negative → UNCERTAIN with conflictingInfo quoting both", () => {
    const r = assessSponsorshipRules({
      text: "Visa sponsorship available for this role. However, candidates must be a U.S. citizen.",
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.confidence).toBe("LOW");
    expect(r.hardReject).toBe(false);
    expect(r.conflictingInfo).toContain("Visa sponsorship available for this role.");
    expect(r.conflictingInfo).toContain("must be a U.S. citizen");
    expect(r.matchedText.length).toBe(2);
  });

  it("positive + soft negative → UNCERTAIN with conflictingInfo", () => {
    const r = assessSponsorshipRules({
      text: "We welcome students on CPT. Sponsorship is not available for this role.",
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.hardReject).toBe(false);
    expect(r.conflictingInfo).toContain("Sponsorship is not available for this role.");
    expect(r.conflictingInfo).toContain("CPT");
  });

  it("🇺🇸 marker + positive text → UNCERTAIN conflict, not auto-reject", () => {
    const r = assessSponsorshipRules({
      text: "Visa sponsorship available.",
      markers: { citizenshipRequired: true },
    });
    expect(r.category).toBe("UNCERTAIN");
    expect(r.hardReject).toBe(false);
    expect(r.conflictingInfo).toContain("🇺🇸");
  });

  it("overlapping negated phrase is NOT treated as a conflict", () => {
    const r = assessSponsorshipRules({
      text: "No visa sponsorship available for this position.",
    });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
    expect(r.conflictingInfo).toBeUndefined();
  });
});

describe("no signals fallback", () => {
  it("company history → COMPANY_HISTORY / MODERATE", () => {
    const r = assessSponsorshipRules({
      text: "Product Intern working with design teams.",
      companyHasHistory: true,
    });
    expect(r.category).toBe("COMPANY_HISTORY");
    expect(r.confidence).toBe("MODERATE");
    expect(r.hardReject).toBe(false);
    expect(r.futureSponsorshipPotential).toBe("LIKELY");
    expect(r.matchedText).toEqual([]);
  });

  it("no history → NO_INFO / UNKNOWN", () => {
    const r = assessSponsorshipRules({
      text: "Product Intern working with design teams.",
    });
    expect(r.category).toBe("NO_INFO");
    expect(r.confidence).toBe("UNKNOWN");
    expect(r.hardReject).toBe(false);
    expect(r.cptCompatible).toBe(true);
    expect(r.futureSponsorshipPotential).toBe("POSSIBLE");
    expect(r.matchedText).toEqual([]);
  });

  it("empty text → NO_INFO", () => {
    const r = assessSponsorshipRules({ text: "" });
    expect(r.category).toBe("NO_INFO");
    expect(r.matchedText).toEqual([]);
  });
});

describe("matchedText sentence extraction", () => {
  it("extracts exactly the containing sentence, trimmed", () => {
    const r = assessSponsorshipRules({
      text: "Acme builds ML tooling. Candidates must be a U.S. citizen. Benefits include housing.",
    });
    expect(r.matchedText).toEqual(["Candidates must be a U.S. citizen."]);
  });

  it("treats newlines and bullets as sentence boundaries", () => {
    const text = [
      "AI Product Management Intern — Summer 2027",
      "• Own roadmap experiments",
      "• Candidates must be a U.S. citizen",
      "• Free lunch",
    ].join("\n");
    const r = assessSponsorshipRules({ text });
    expect(r.matchedText).toEqual(["Candidates must be a U.S. citizen"]);
  });

  it("clamps very long sentences to 200 chars while keeping the matched phrase", () => {
    const filler =
      "the successful candidate will collaborate closely with cross functional partners across many teams ";
    const text = filler.repeat(3) + "and must be a U.S. citizen " + filler.repeat(3);
    const r = assessSponsorshipRules({ text });
    expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    expect(r.matchedText.length).toBe(1);
    expect(r.matchedText[0].length).toBeLessThanOrEqual(200);
    expect(r.matchedText[0]).toContain("must be a U.S. citizen");
  });
});

describe("stemOptRelevant", () => {
  it("true for software/engineering/data text", () => {
    const r = assessSponsorshipRules({
      text: "Software Engineering Intern, data platform team.",
    });
    expect(r.stemOptRelevant).toBe(true);
  });

  it("true for uppercase AI mention", () => {
    const r = assessSponsorshipRules({ text: "Intern on the AI enablement team." });
    expect(r.stemOptRelevant).toBe(true);
  });

  it("unset for non-STEM text", () => {
    const r = assessSponsorshipRules({
      text: "Marketing Intern supporting brand campaigns.",
    });
    expect(r.stemOptRelevant).toBeUndefined();
  });

  it("still reported alongside a hard reject", () => {
    const r = assessSponsorshipRules({
      text: "Machine learning intern. Must be a U.S. citizen.",
    });
    expect(r.hardReject).toBe(true);
    expect(r.stemOptRelevant).toBe(true);
  });
});

// ── Section 19: Akuna Capital regression ─────────────────────────────────────
describe("Akuna Capital regression (section 19)", () => {
  const AKUNA =
    "Legal authorization to work in the U.S. as of the first day of employment, including F-1 students using OPT or STEM.";

  it("official F-1/OPT sentence → CPT_OPT_ACCEPTED, never citizenship-required", () => {
    const r = assessSponsorshipRules({ text: AKUNA });
    expect(r.category).toBe("CPT_OPT_ACCEPTED");
    expect(r.category).not.toBe("CITIZENSHIP_REQUIRED");
    expect(r.hardReject).toBe(false);
    expect(r.cptCompatible).toBe(true);
    expect(r.optCompatible).toBe(true);
    // exact quote retained as evidence
    expect(r.matchedText).toContain(AKUNA);
  });

  it("warns that CPT is not explicitly mentioned when only OPT/STEM appear", () => {
    const r = assessSponsorshipRules({ text: AKUNA });
    expect(r.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/CPT.*not.*mention/i)]),
    );
  });

  it("official F-1/OPT text overrides a 🇺🇸 aggregator marker (surfaces conflict, not Ineligible)", () => {
    const r = assessSponsorshipRules({ text: AKUNA, markers: { citizenshipRequired: true } });
    expect(r.hardReject).toBe(false);
    expect(r.category).toBe("UNCERTAIN");
    expect(r.conflictingInfo).toContain("🇺🇸");
  });
});

// ── Rescore marker reconstruction (markers aren't stored raw) ────────────────
describe("reconstructMarkersFromQuotes", () => {
  it("reconstructs a 🇺🇸 citizenship marker from its stored quote", () => {
    const m = reconstructMarkersFromQuotes(["Source marker 🇺🇸: U.S. citizenship required"]);
    expect(m).toEqual({ citizenshipRequired: true });
  });

  it("reconstructs a 🛂 no-sponsorship marker from its stored quote", () => {
    const m = reconstructMarkersFromQuotes(["Source marker 🛂: does not offer sponsorship"]);
    expect(m).toEqual({ noSponsorship: true });
  });

  it("does not conflate the two markers (regression: citizenship must not become no-sponsorship)", () => {
    const m = reconstructMarkersFromQuotes(["Source marker 🇺🇸: U.S. citizenship required"]);
    expect(m.noSponsorship).toBeUndefined();
  });

  it("returns no markers for ordinary text quotes", () => {
    const m = reconstructMarkersFromQuotes(["Candidates must be a U.S. citizen."]);
    expect(m).toEqual({});
  });
});

// ── Section 3: authorization language must NOT be read as citizenship ─────────
describe("authorization language is not citizenship (section 3)", () => {
  it("'Must be legally authorized to work' → not citizenship, not reject", () => {
    const r = assessSponsorshipRules({
      text: "Must be legally authorized to work in the United States.",
    });
    expect(r.category).not.toBe("CITIZENSHIP_REQUIRED");
    expect(r.hardReject).toBe(false);
  });

  it("'U.S. citizenship is not required' → not citizenship, not reject", () => {
    const r = assessSponsorshipRules({
      text: "U.S. citizenship is not required for this role.",
    });
    expect(r.category).not.toBe("CITIZENSHIP_REQUIRED");
    expect(r.hardReject).toBe(false);
  });

  it("citizenship only inside an EEO statement → not a requirement", () => {
    const r = assessSponsorshipRules({
      text: "We are an equal opportunity employer and consider all applicants regardless of race, religion, national origin, or citizenship status.",
    });
    expect(r.category).not.toBe("CITIZENSHIP_REQUIRED");
    expect(r.hardReject).toBe(false);
  });

  it("'F-1 students using CPT or OPT are welcome' → CPT_OPT_ACCEPTED", () => {
    const r = assessSponsorshipRules({
      text: "F-1 students using CPT or OPT are welcome to apply.",
    });
    expect(r.category).toBe("CPT_OPT_ACCEPTED");
    expect(r.hardReject).toBe(false);
  });

  it("'we do not provide future immigration sponsorship' never fabricates citizenship", () => {
    const r = assessSponsorshipRules({
      text: "We do not provide future immigration sponsorship.",
    });
    expect(r.category).not.toBe("CITIZENSHIP_REQUIRED");
  });
});

// Regression: post-fix validation found Palantir defense/intel roles ranked at
// the top because the clearance rule required the exact phrase "active security
// clearance" — the real postings say "Active US Security clearance" and
// "Active Full Scope Poly Level clearance".
describe("security clearance phrasings (validation regression)", () => {
  const cases = [
    "What We Require: Active US Security clearance, or eligibility and willingness to obtain a US Security clearance.",
    "Active Full Scope Poly Level clearance required.",
    "Must hold an active TS/SCI clearance.",
    "Requires an active Top Secret clearance.",
    "Ability to obtain and maintain a US government security clearance.",
  ];
  for (const text of cases) {
    it(`rejects: "${text.slice(0, 46)}…"`, () => {
      const r = assessSponsorshipRules({ text });
      expect(r.category).toBe("CLEARANCE_REQUIRED");
      expect(r.hardReject).toBe(true);
    });
  }

  it("does not fire on unrelated uses of the word 'clearance'", () => {
    const r = assessSponsorshipRules({ text: "Work with legal on clearance of marketing copy." });
    expect(r.category).not.toBe("CLEARANCE_REQUIRED");
    expect(r.hardReject).toBe(false);
  });
});

// Regression: Arkansas/Bastazo says "without a current or future need for visa
// sponsorship" — same meaning as "must not require sponsorship now or in the
// future" but different word order, so it slipped past the rules.
describe("no-sponsorship phrasings with reversed word order", () => {
  const cases = [
    "Ability to work full-time in the United States without a current or future need for visa sponsorship.",
    "Must be able to work in the US without current or future sponsorship.",
    "Candidates must not need visa sponsorship now or in the future.",
  ];
  for (const text of cases) {
    it(`rejects: "${text.slice(0, 50)}…"`, () => {
      const r = assessSponsorshipRules({ text });
      expect(r.hardReject).toBe(true);
    });
  }
});

// Regression (live Anduril posting): "U.S. Person status is required as this
// position needs to access export controlled data" excludes an F-1 student,
// but no export-control rule existed so the role passed as NO_INFO.
describe("export control / U.S. Person requirements", () => {
  const cases = [
    "U.S. Person status is required as this position needs to access export controlled data.",
    "Must be a U.S. Person as defined by ITAR.",
    "This role requires access to export-controlled technology; applicants must be US Persons.",
    "Candidates must qualify as a U.S. person under EAR and ITAR regulations.",
  ];
  for (const text of cases) {
    it(`rejects: "${text.slice(0, 48)}…"`, () => {
      const r = assessSponsorshipRules({ text });
      expect(r.hardReject).toBe(true);
      expect(r.category).toBe("CITIZENSHIP_REQUIRED");
    });
  }

  it("does not fire on a generic export-controls compliance note", () => {
    const r = assessSponsorshipRules({
      text: "Databricks complies with all applicable export control laws and regulations.",
    });
    expect(r.hardReject).toBe(false);
  });
});

describe("clearance negation is not a clearance requirement", () => {
  it("keeps 'A security clearance is not required for this position'", () => {
    const r = assessSponsorshipRules({
      text: "A security clearance is not required for this position.",
    });
    expect(r.hardReject).toBe(false);
    expect(r.category).not.toBe("CLEARANCE_REQUIRED");
  });

  it("keeps 'No security clearance required.'", () => {
    const r = assessSponsorshipRules({ text: "No security clearance required." });
    expect(r.hardReject).toBe(false);
    expect(r.category).not.toBe("CLEARANCE_REQUIRED");
  });

  it("keeps 'This role does not require an active security clearance.'", () => {
    const r = assessSponsorshipRules({
      text: "This role does not require an active security clearance.",
    });
    expect(r.hardReject).toBe(false);
    expect(r.category).not.toBe("CLEARANCE_REQUIRED");
  });

  it("still rejects 'An active TS/SCI clearance is required.'", () => {
    const r = assessSponsorshipRules({ text: "An active TS/SCI clearance is required." });
    expect(r.category).toBe("CLEARANCE_REQUIRED");
    expect(r.hardReject).toBe(true);
  });

  it("still rejects 'Candidates must hold an Active US Security clearance.'", () => {
    const r = assessSponsorshipRules({
      text: "Candidates must hold an Active US Security clearance.",
    });
    expect(r.category).toBe("CLEARANCE_REQUIRED");
    expect(r.hardReject).toBe(true);
  });
});

describe("refusal phrasings that previously scored NO_INFO", () => {
  it("rejects 'We are not able to sponsor visas for this position.'", () => {
    const r = assessSponsorshipRules({
      text: "We are not able to sponsor visas for this position.",
    });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
  });

  it("rejects 'This position is not eligible for visa sponsorship.'", () => {
    const r = assessSponsorshipRules({
      text: "This position is not eligible for visa sponsorship.",
    });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
  });

  it("rejects 'This role is not eligible for immigration sponsorship.'", () => {
    const r = assessSponsorshipRules({
      text: "This role is not eligible for immigration sponsorship.",
    });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
  });

  it("rejects 'We cannot provide sponsorship for this role.'", () => {
    const r = assessSponsorshipRules({
      text: "We cannot provide sponsorship for this role.",
    });
    expect(r.category).toBe("EXPLICITLY_UNAVAILABLE");
    expect(r.hardReject).toBe(true);
  });

  it("does not hard-reject the hedged 'may not be able to sponsor'", () => {
    const r = assessSponsorshipRules({
      text: "We may not be able to sponsor visas for every role.",
    });
    expect(r.hardReject).toBe(false);
  });
});
