import { describe, expect, it } from "vitest";
import { parseCompensation, parseLocation, deriveArrangement, keywordRelevance } from "@/agent/normalize";

describe("parseLocation", () => {
  it("parses City, ST", () => {
    const l = parseLocation("San Francisco, CA");
    expect(l).toMatchObject({ city: "San Francisco", state: "CA", country: "US", isRemote: false });
  });
  it("parses full state names", () => {
    expect(parseLocation("San Mateo, California")).toMatchObject({ state: "CA", country: "US" });
  });
  it("detects US remote", () => {
    expect(parseLocation("Remote - USA")).toMatchObject({ country: "US", isRemote: true });
  });
  it("flags non-US locations", () => {
    expect(parseLocation("London, United Kingdom").country).toBe("GB");
    expect(parseLocation("Berlin, Germany").country).toBe("DE");
    expect(parseLocation("Toronto, Canada").country).toBe("CA");
  });
  it("keeps '+N' suffixed locations as US when state present", () => {
    expect(parseLocation("Menlo Park, CA +3")).toMatchObject({ state: "CA", country: "US" });
  });
  it("resolves US towns sharing a foreign city's name via the state code", () => {
    expect(parseLocation("Vancouver, WA")).toMatchObject({ city: "Vancouver", state: "WA", country: "US" });
    expect(parseLocation("Dublin, OH")).toMatchObject({ city: "Dublin", state: "OH", country: "US" });
  });
  it("keeps the real foreign cities foreign", () => {
    expect(parseLocation("Vancouver, BC").country).toBe("CA");
    expect(parseLocation("Dublin, Ireland").country).toBe("NON_US");
  });
  it("lets a named foreign country beat a US state code", () => {
    expect(parseLocation("Perth, WA, Australia").country).toBe("NON_US");
  });
  it("reads a province + ISO 'CA' suffix as Canada, not California", () => {
    expect(parseLocation("Toronto, ON, CA").country).toBe("CA");
    expect(parseLocation("Mississauga, ON, CA").country).toBe("CA");
    expect(parseLocation("London, ON").country).toBe("CA");
  });
  it("keeps real US-state hits decisive over an incidental province token", () => {
    expect(parseLocation("Ontario, CA")).toMatchObject({ state: "CA", country: "US" });
  });
  it("returns UNKNOWN country for unparseable strings", () => {
    expect(parseLocation("Anywhere on Earth").country).toBe("UNKNOWN");
  });
});

describe("parseCompensation", () => {
  it("handles unknown", () => {
    expect(parseCompensation(undefined).payType).toBe("UNKNOWN");
    expect(parseCompensation("").payType).toBe("UNKNOWN");
  });
  it("parses hourly single value", () => {
    expect(parseCompensation("$52/hr")).toMatchObject({ payType: "HOURLY", minAmount: 52, period: "hour" });
  });
  it("parses hourly range", () => {
    expect(parseCompensation("$45-55/hour")).toMatchObject({ minAmount: 45, maxAmount: 55 });
  });
  it("parses monthly", () => {
    expect(parseCompensation("$8,000 per month")).toMatchObject({ payType: "MONTHLY", minAmount: 8000, period: "month" });
  });
  it("detects unpaid", () => {
    expect(parseCompensation("Unpaid").payType).toBe("UNPAID");
  });
  it("guesses hour for small bare numbers", () => {
    expect(parseCompensation("$62").period).toBe("hour");
  });
});

describe("deriveArrangement", () => {
  it("onsite when city only", () => {
    expect(deriveArrangement([parseLocation("Austin, TX")])).toBe("ONSITE");
  });
  it("remote when remote-only", () => {
    expect(deriveArrangement([parseLocation("Remote - USA")])).toBe("REMOTE");
  });
  it("hybrid when both", () => {
    expect(deriveArrangement([parseLocation("Remote - USA"), parseLocation("Boston, MA")])).toBe("HYBRID");
  });
});

describe("keywordRelevance", () => {
  it("scores AI PM text on both axes", () => {
    const r = keywordRelevance("AI Product Management Intern working on LLM roadmap");
    expect(r.ai).toBeGreaterThan(50);
    expect(r.pm).toBeGreaterThan(50);
  });
  it("scores plain SWE low", () => {
    const r = keywordRelevance("Software Engineer Intern, backend services");
    expect(r.ai).toBe(0);
    expect(r.pm).toBe(0);
  });
});
