import { describe, expect, it } from "vitest";
import { assertAllowedOnDemo, isDemoMode } from "@/server/demo";
import { ApiError } from "@/server/api-helpers";

/* The guard decides whether a public deployment can be wrecked by a stranger,
   so the interesting cases are the ones where a truthy-looking value is not a
   yes, and the ones where a missing value must not become one. */

describe("isDemoMode", () => {
  it("is on for the documented values", () => {
    for (const v of ["1", "true", "TRUE", " true ", "True"]) {
      expect(isDemoMode({ DEMO_MODE: v }), v).toBe(true);
    }
  });

  it("is off when the variable is absent", () => {
    expect(isDemoMode({})).toBe(false);
  });

  it("is off for an empty string, which is what an uncommented `DEMO_MODE=` produces", () => {
    // CI and .env files both hand through unset variables as "", and a blank
    // value must not read as consent to disable half the app.
    expect(isDemoMode({ DEMO_MODE: "" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "   " })).toBe(false);
  });

  it("is off for values that are not the documented ones", () => {
    // Notably "0" and "false" — a deployment that says DEMO_MODE=false must
    // behave like a normal app, not like a demo because the string was present.
    for (const v of ["0", "false", "no", "yes", "on", "demo"]) {
      expect(isDemoMode({ DEMO_MODE: v }), v).toBe(false);
    }
  });
});

describe("assertAllowedOnDemo", () => {
  it("does nothing on a normal deployment", () => {
    expect(() => assertAllowedOnDemo("nope", {})).not.toThrow();
  });

  it("throws a 403 carrying the reason, so the caller can show it", () => {
    const reason = "Changing the scoring settings is disabled on the public demo.";
    try {
      assertAllowedOnDemo(reason, { DEMO_MODE: "1" });
      throw new Error("expected assertAllowedOnDemo to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(403);
      expect((e as ApiError).message).toBe(reason);
    }
  });
});
