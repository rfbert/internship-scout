import { describe, expect, it } from "vitest";
import { shouldReopenAutoRejection } from "@/server/eligibility";

const NOW_ELIGIBLE = { band: "WORTH_REVIEWING", hardReject: false, status: "ACTIVE" };

describe("shouldReopenAutoRejection", () => {
  it("reopens an auto-rejected listing that is no longer ineligible", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "MARKED_INELIGIBLE", note: "Auto-rejected: The listing requires U.S. citizenship..." },
        NOW_ELIGIBLE,
      ),
    ).toBe(true);
  });

  it("does NOT reopen a user's own manual ineligible decision", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "MARKED_INELIGIBLE", note: "Not interested — requires relocation" },
        NOW_ELIGIBLE,
      ),
    ).toBe(false);
  });

  it("does NOT reopen when the listing is still ineligible-band", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "MARKED_INELIGIBLE", note: "Auto-rejected: ..." },
        { band: "INELIGIBLE", hardReject: false, status: "ACTIVE" },
      ),
    ).toBe(false);
  });

  it("does NOT reopen when a hard reject still applies", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "MARKED_INELIGIBLE", note: "Auto-rejected: ..." },
        { band: "WORTH_REVIEWING", hardReject: true, status: "ACTIVE" },
      ),
    ).toBe(false);
  });

  it("does NOT reopen a closed listing", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "MARKED_INELIGIBLE", note: "Auto-rejected: ..." },
        { band: "WORTH_REVIEWING", hardReject: false, status: "CLOSED" },
      ),
    ).toBe(false);
  });

  it("does NOT reopen a non-ineligible decision (e.g. accepted)", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "ACCEPTED", note: "Auto-rejected: ..." },
        NOW_ELIGIBLE,
      ),
    ).toBe(false);
  });

  it("handles a null decision", () => {
    expect(shouldReopenAutoRejection(null, NOW_ELIGIBLE)).toBe(false);
  });
});

describe("rescore-archived decisions", () => {
  const verdictOk = { band: "REACH", hardReject: false, status: "ACTIVE" };

  it("reopens a pure auto-archived-at-rescore decision", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "MARKED_INELIGIBLE", note: "Auto-archived at rescore: Skip — wrong season" },
        verdictOk,
      ),
    ).toBe(true);
  });

  it("never reopens when the note starts with the user's own text", () => {
    expect(
      shouldReopenAutoRejection(
        {
          state: "MARKED_INELIGIBLE",
          note: "keeping an eye on this one\nAuto-archived at rescore: Skip — wrong season",
        },
        verdictOk,
      ),
    ).toBe(false);
  });

  it("still reopens classic 'Auto-rejected:' notes", () => {
    expect(
      shouldReopenAutoRejection(
        { state: "MARKED_INELIGIBLE", note: "Auto-rejected: requires citizenship" },
        verdictOk,
      ),
    ).toBe(true);
  });
});
